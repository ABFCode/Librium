package com.example.springreader.service;

import com.example.springreader.dto.BookMetaDTO;
import com.example.springreader.dto.ChapterContentDTO;
import com.example.springreader.dto.ChapterDTO;
import com.example.springreader.exception.EpubProcessingException;
import com.example.springreader.exception.ResourceNotFoundException;
import com.example.springreader.model.*;
import com.example.springreader.repository.BookRepository;
import com.example.springreader.repository.ChapterRepository;
import com.example.springreader.repository.UserBookRepository;
import com.example.springreader.utility.EpubParser;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.util.*;

/**
 * Service layer for managing books and their related data (metadata, chapters, cover images).
 * Handles interactions with repositories and the EpubParser utility.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class LibraryService {
    private final BookRepository bookRepository;
    private final ChapterRepository chapterRepository;
    private final UserBookRepository userBookRepository;
    private final String uploadDir;


    /**
     * Parses an EPUB file, extracts metadata and cover image, saves the book
     * and its chapters to the database.
     *
     * @param epubFile The EPUB file to process.
     * @return The newly created and saved Book entity.
     * @throws IOException If an error occurs during file reading or writing.
     * @throws EpubProcessingException If an error occurs during EPUB parsing.
     */
    @Transactional
    public Book addBook(File epubFile) throws IOException, EpubProcessingException {
        Map<String, Object> meta = EpubParser.parseMeta(epubFile);
        String title = EpubParser.getTitle(meta);
        String author = EpubParser.getAuthor(meta);
        String coverImagePath = null;

        EpubToc toc = EpubParser.getToc(meta);
        List<EpubChapter> flattenedToc = flattenToc(toc);


        Optional<Map<String, Object>> coverImageData = EpubParser.extractCoverImage(epubFile);

        if(coverImageData.isPresent()) {
            coverImagePath = extractAndSaveCoverImage(coverImageData.get());
        }
        else{
            log.warn("No cover data found for epub: {}", epubFile.getName());
        }

        Book book = new Book(title, author, epubFile.getName(), coverImagePath);

        //Persist each chapter associated with the book
        for(EpubChapter EpubChapter: flattenedToc){
            Chapter chapter = new Chapter(EpubChapter.title(), EpubChapter.index(), EpubChapter.filePath(), EpubChapter.anchor(), book);
            book.addChapter(chapter); //Associates chapter with book before saving
        }
        return  bookRepository.save(book); //Saves book and cascades to save chapters
    }

    /**
     * Saves the extracted cover image bytes to the filesystem within the upload directory.
     * Generates a unique filename based on UUID and the image's media type.
     *
     * @param coverImageData A map containing the cover image bytes ("coverImage") and media type ("mediaType").
     * @return The relative path to the saved cover image within the upload directory.
     * @throws IOException If an error occurs creating directories or writing the file.
     */
    public String extractAndSaveCoverImage(Map<String, Object> coverImageData) throws IOException{
        byte[] image = (byte[]) coverImageData.get("coverImage");
        String mediaType = (String) coverImageData.get("mediaType");
        String coverImagePath;

        String fileExtension = "jpg"; //Default
        if(mediaType != null && mediaType.contains("/")){
            fileExtension = mediaType.substring(mediaType.indexOf("/") + 1);
        }
        else{
            log.warn("Invalid or missing MediaType: {}, defaulting to 'jpg'", mediaType);
        }

        Path coverDir = Path.of(uploadDir, "covers");
        if(!Files.exists(coverDir)){
            Files.createDirectories(coverDir);
            log.info("Created covers directory at: {}", coverDir);
        }

        String filename = UUID.randomUUID() + "." + fileExtension;
        //Store relative path for database
        coverImagePath = "covers/" + filename;

        Files.write(coverDir.resolve(filename), image);
        return coverImagePath;
    }

    /**
     * Flattens the EpubToc into a single, ordered list of chapters.
     *
     * @param toc The EpubToc object parsed from the EPUB.
     * @return A List of EpubChapter objects in the order they appear in the TOC.
     */
    public List<EpubChapter> flattenToc(EpubToc toc) {
        List<EpubChapter> flattenedToc = new ArrayList<>();
        if (toc != null && toc.getContentFiles() != null) {
            for (EpubContentFile contentFile : toc.getContentFiles()) {
                for (EpubChapter chapter : contentFile.getChapters()) {
                    //Ensure title is not null before trimming
                    String trimmedTitle = chapter.title() != null ? chapter.title().trim() : "Untitled Chapter";
                    flattenedToc.add(new EpubChapter(trimmedTitle, chapter.anchor(), chapter.index(), contentFile.getFilePath()));
                }
            }
        }
        return flattenedToc;
    }

    /**
     * Deletes the association between a user and a book (UserBook).
     * If the book is not a default book and no other users are associated with it (implicitly checked by cascade/orphanRemoval,
     * though explicit check might be safer depending on JPA provider behavior),
     * it also deletes the Book entity and its corresponding EPUB and cover image files.
     *
     * @param bookId The ID of the book to delete the association for.
     * @param userId The ID of the user initiating the deletion.
     * @throws ResourceNotFoundException If the UserBook association doesn't exist.
     */
    @Transactional
    public void deleteBook(Long bookId, Long userId){
        log.info("Attempting to delete book association for bookId: {} and userId: {}", bookId, userId);
        UserBook userBook = userBookRepository.findByUserIdAndBookId(userId, bookId)
                .orElseThrow(() -> new ResourceNotFoundException("UserBook not found with bookId: " + bookId + " for userId: " + userId));

        Book book = userBook.getBook();
        if (book == null) {
            //This should never happen.
            log.error("UserBook with id {} has a null book reference.", userBook.getId());
            userBookRepository.delete(userBook);
            return;
        }

        String epubFilePath = book.getFilePath();
        String coverImagePath = book.getCoverImagePath();

        //Delete the user-book association
        userBookRepository.delete(userBook);
        log.info("Deleted UserBook association for bookId: {} and userId: {}", bookId, userId);

        //Check if the book is default
        if(book.isDefault()){
            log.info("Skipping deletion of default book for user: {}", userId);
        }
        else{
            bookRepository.delete(book);
            deleteFile(epubFilePath, "epub");
            log.info("Epub file deleted with path: {}", epubFilePath);
            if(coverImagePath != null && !coverImagePath.isBlank()){
                deleteFile(coverImagePath, "cover image");
                log.info("Cover image deleted with path: {}", coverImagePath);
            }
            log.info("Book record deleted with id: {}", bookId);
        }
        log.info("Book record deleted with id: {}", bookId);

    }

    /**
     * Deletes a file from the filesystem within the upload directory.
     *
     * @param filePathStr The relative path of the file to delete within the upload directory.
     * @param type A descriptive string for the type of file being deleted ("epub", "cover image") for logging.
     */
    public void deleteFile(String filePathStr, String type){
        if(filePathStr == null || filePathStr.isBlank()){
            log.warn("Cannot delete file of type '{}', file path is null or blank.", type);
            return;
        }

        Path path = Path.of(uploadDir).resolve(filePathStr).normalize();

        //Basic security check to prevent path traversal outside uploadDir
        if (!path.startsWith(Path.of(uploadDir).normalize())) {
            log.error("Attempted to delete file outside of the upload directory: {}", path);
            return;
        }

        try{
            boolean deleted = Files.deleteIfExists(path);
            if (deleted) {
                log.info("Deleted {} file: {}", type, path);
            } else {
                log.warn("{} file not found for deletion at path: {}", type, path);
            }
        }
        catch(IOException e){
            log.error("Error deleting {} file: {}", type, path, e);
            //Decide if this should re-throw an exception depending on requirements
        }
    }

    public File saveUploadedFile(MultipartFile file) throws IOException {
        if(file == null || file.isEmpty()){
            throw new IllegalArgumentException("File cannot be null or empty");
        }

        String originalFileName = file.getOriginalFilename();
        if(originalFileName == null || !originalFileName.toLowerCase().endsWith(".epub")){
            throw new IllegalArgumentException("Invalid filename. Only epub files are supported");
        }

        return null;
    }

    /**
     * Retrieves metadata (title, author, chapters) for a specific book.
     *
     * @param bookId The ID of the book to retrieve metadata for.
     * @return A BookMetaDTO containing the book's metadata.
     * @throws ResourceNotFoundException If the book with the given ID doesn't exist.
     */
    @Transactional(readOnly = true)
    public BookMetaDTO getBookMeta(Long bookId) throws ResourceNotFoundException {
        Book book = bookRepository.findById(bookId)
                .orElseThrow(() -> new ResourceNotFoundException("Book", bookId.toString()));

        List<ChapterDTO> chapters = book.getChapters().stream()
                .map(chapter -> new ChapterDTO(chapter.getTitle(), chapter.getAnchor(), chapter.getChapterIndex()))
                .toList();

        return new BookMetaDTO(book.getTitle(), book.getAuthor(), chapters);
    }

    /**
     * Retrieves the EPUB file resource and its original filename for a specific book
     *
     * @param bookId The ID of the book to retrieve.
     * @param userId The ID of the user requesting the book.
     * @return A Map containing the filename ("fileName") and the file Resource ("bookData").
     * @throws ResourceNotFoundException If the UserBook association or the book file path is missing.
     * @throws IOException If the file cannot be found or read at the stored path.
     */
    @Transactional(readOnly = true)
    public Map<String, Object> getBookResources(Long bookId, Long userId) throws ResourceNotFoundException, IOException {
        UserBook userBook = userBookRepository.findByUserIdAndBookId(userId, bookId)
                .orElseThrow(() -> new ResourceNotFoundException("UserBook not found with bookId: " + bookId + " and User Id: " + userId));

        Book book = userBook.getBook();
        String relativeFilePath = book.getFilePath();
        if(relativeFilePath == null || relativeFilePath.isBlank()){
            log.error("Book file path is missing for bookId: {}", bookId);
            throw new ResourceNotFoundException("Book file path is missing for bookId: " + bookId);
        }

        Path absoluteFilePath = Path.of(uploadDir).resolve(relativeFilePath).normalize();

        if (!absoluteFilePath.startsWith(Path.of(uploadDir).normalize())) {
            log.error("Attempted to access file outside of the upload directory: {}", absoluteFilePath);
            throw new SecurityException("Access denied to file path: " + absoluteFilePath);
        }

        Resource bookData = new FileSystemResource(absoluteFilePath);

        if(!bookData.exists() || !bookData.isReadable()){
            log.error("EPUB file not found or not readable at path: {}", absoluteFilePath);
            throw new NoSuchFileException("EPUB not found or readable at path: " + absoluteFilePath);
        }

        Map<String, Object> bookInfo = new HashMap<>();
        // Use the original filename stored in the Book entity if available, otherwise derive from path
        bookInfo.put("fileName", Path.of(relativeFilePath).getFileName().toString());
        bookInfo.put("bookData", bookData);

        return bookInfo;
    }

    /**
     * Retrieves and parses the content of a specific chapter within a book.
     *
     * @param bookId The ID of the book containing the chapter.
     * @param chapterIndex The index of the chapter to retrieve.
     * @return A ChapterContentDTO containing the parsed text content of the chapter.
     * @throws IOException If the EPUB file cannot be found or read.
     * @throws EpubProcessingException If an error occurs during chapter content parsing.
     * @throws ResourceNotFoundException If the book or the specific chapter index is not found.
     */
    @Transactional(readOnly = true)
    public ChapterContentDTO getChapterContent(Long bookId, Integer chapterIndex) throws IOException, EpubProcessingException, ResourceNotFoundException {
        Book book = bookRepository.findById(bookId)
                .orElseThrow(() -> new ResourceNotFoundException("Book", bookId.toString()));

        Chapter chapter = chapterRepository.findByBookIdAndChapterIndex(bookId, chapterIndex);

        Path epubPath = Path.of(uploadDir).resolve(book.getFilePath()).normalize();

        if (!epubPath.startsWith(Path.of(uploadDir).normalize())) {
            log.error("Attempted to access EPUB file outside of the upload directory: {}", epubPath);
            throw new SecurityException("Access denied to EPUB path: " + epubPath);
        }

        if(!Files.exists(epubPath)){
            log.error("Epub file does not exist at path: {}", epubPath);
            throw new NoSuchFileException("Epub file does not exist at path: " + epubPath);
        }

        String content = EpubParser.parseContent(epubPath, chapter.getFilePath(), chapter.getAnchor());
        return new ChapterContentDTO(content);
    }

    /**
     * Retrieves the cover image resource and its content type for a specific book
     *
     * @param bookId The ID of the book whose cover image is requested.
     * @param userId The ID of the user requesting the cover image.
     * @return A Map containing the image Resource ("coverImage") and its MediaType ("contentType").
     * @throws ResourceNotFoundException If the UserBook association, cover image path, or the image file itself is missing.
     */
    @Transactional(readOnly = true)
    public Map<String, Object> getCoverImage(Long bookId, Long userId) throws ResourceNotFoundException {
        UserBook userBook = userBookRepository.findByUserIdAndBookId(userId, bookId)
                .orElseThrow(() -> new ResourceNotFoundException("UserBook not found for bookId: " + bookId + " and userId: " + userId));

        Book book = userBook.getBook();
        String coverImagePath = book.getCoverImagePath();
        if(coverImagePath == null || coverImagePath.isBlank()){
            log.warn("Book cover image path is missing for bookId: {}", bookId);
            throw new ResourceNotFoundException("Book cover image path is missing for bookId: " + bookId);
        }

        Path absoluteCoverImagePath = Path.of(uploadDir).resolve(coverImagePath).normalize();

        if (!absoluteCoverImagePath.startsWith(Path.of(uploadDir).normalize())) {
            log.error("Attempted to access cover image outside of the upload directory: {}", absoluteCoverImagePath);
            throw new SecurityException("Access denied to cover image path: " + absoluteCoverImagePath);
        }

        Resource resource = new FileSystemResource(absoluteCoverImagePath);

        if(!resource.exists()){
            log.error("Cover image file missing at path {} for bookId {}, despite DB record.", absoluteCoverImagePath, bookId);
            throw new ResourceNotFoundException("Cover Image File", "Path: " + absoluteCoverImagePath);
        }

        MediaType contentType = MediaType.IMAGE_JPEG; //Default to JPEG
        if(coverImagePath.endsWith(".png")){
            contentType = MediaType.IMAGE_PNG;
        }

        Map<String, Object> response = new HashMap<>();
        response.put("coverImage", resource);
        response.put("contentType", contentType);

        return response;
    }
}
