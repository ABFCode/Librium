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
 * Provides methods to interact with our bookRepo thereby interacting with our DB. Right now we can just add a book
 * and list all of them.
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
     * Adds a new book to the repository.
     * Extracts the cover image and saves it.
     * Save each chapter for the book separately
     *
     * @param epubFile the EPUB file containing the book's info
     * @return the saved Book object
     */
    @Transactional
    public Book addBook(File epubFile) throws IOException{
        Map<String, Object> meta = EpubParser.parseMeta(epubFile);
        String title = EpubParser.getTitle(meta);
        String author = EpubParser.getAuthor(meta);
        String coverImagePath = null;

        EpubToc toc = EpubParser.getToc(meta);
        List<EpubChapter> flattenedToc = flattenToc(toc);


        Optional<Map<String, Object>> coverImageData = EpubParser.extractCoverImage(epubFile);

        if(coverImageData.isPresent()) {
            //log.info("Found cover image");
            coverImagePath = extractAndSaveCoverImage(coverImageData.get());
        }
        else{
            log.error("No cover data found");
        }

//        log.info("Epub Absolute Path: {}", epubFile.getAbsolutePath());
//        log.info("Epub Relative Path: {}", epubFile.getPath());
//        log.info("Test Path: {}", Path.of(uploadDir, epubFile.getName()));

        Book book = new Book(title, author, epubFile.getName(), coverImagePath);

        for(EpubChapter EpubChapter: flattenedToc){
            //log.info("Chapter: {}", EpubChapter.filePath());
            Chapter chapter = new Chapter(EpubChapter.title(), EpubChapter.index(), EpubChapter.filePath(), EpubChapter.anchor(), book);
            book.addChapter(chapter);
        }
        return  bookRepository.save(book);
    }


    public String extractAndSaveCoverImage(Map<String, Object> coverImageData) throws IOException{
        byte[] image = (byte[]) coverImageData.get("coverImage");
        String mediaType = (String) coverImageData.get("mediaType");
        String coverImagePath;

        String fileExtension = "";
        if(mediaType != null && mediaType.contains("/")){
            fileExtension = mediaType.substring(mediaType.indexOf("/") + 1);
        }
        else{
            log.warn("Invalid or missing MediaType: {}", mediaType);
        }

        Path coverDir = Path.of(uploadDir, "covers");
        log.info("Cover dir: {}", coverDir);
        if(!Files.exists(coverDir)){
            log.info("Cover directory does not exist");
            Files.createDirectories(coverDir);
            log.info("Created covers directory");
        }

        String filename = UUID.randomUUID() + "." + fileExtension;
        coverImagePath = "covers/" + filename;

        Files.write(coverDir.resolve(filename), image);
        //log.info("Cover image path: {}", coverImagePath);
        return coverImagePath;
    }

    /**
     * Flattens the toc object into a single list of EpubChapter objects.
     * It does this by iterating through each content file, extracting all the chapters, and appending them to a single
     * list.
     * @param toc Our EpubToc object
     * @return A list of chapters in order
     */
    public List<EpubChapter> flattenToc(EpubToc toc) {
        List<EpubChapter> flattenedToc = new ArrayList<>();
        if (toc != null && toc.getContentFiles() != null) {
            for (EpubContentFile contentFile : toc.getContentFiles()) {
                for (EpubChapter chapter : contentFile.getChapters()) {
                    String trimmedTitle = chapter.title() != null ? chapter.title().trim() : null;
                    flattenedToc.add(new EpubChapter(trimmedTitle, chapter.anchor(), chapter.index(), contentFile.getFilePath()));
                }
            }
        }
        return flattenedToc;
    }


    @Transactional
    public void deleteBook(Long bookId, Long userId){
        log.info("Deleting book with id: {}", bookId);
        UserBook userBook = userBookRepository.findByUserIdAndBookId(userId, bookId).orElseThrow(() -> new ResourceNotFoundException("UserBook not found with bookId: " + bookId));
        Book book = userBook.getBook();

        String epubFilePath = book.getFilePath();
        String coverImagePath = book.getCoverImagePath();


        userBookRepository.delete(userBook);


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

    public void deleteFile(String filePathStr, String type){
        if(filePathStr == null || filePathStr.isBlank()){
            log.error("Cannot delete file, file path cannot be null or blank");
            return;
        }

        Path path = Path.of(uploadDir).resolve(filePathStr);
        try{
            Files.deleteIfExists(path);
        }
        catch(IOException e){
            log.error("Error deleting file: {}, of type {}", filePathStr, type, e);
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
     * Constructs our metaDataDTO to return to the user. Uses a given ID to retrieve a book and its chapters.
     * @param BookId File object representing an epub
     * @return Our constructed BookMetaDTO
     */
    public BookMetaDTO getBookMeta(Long BookId) {
        Book book = bookRepository.findById(BookId).orElseThrow();
        List<ChapterDTO> chapters = new ArrayList<>();
        book.getChapters().forEach(chapter -> {
            ChapterDTO chapterDTO = new ChapterDTO(chapter.getTitle(), chapter.getAnchor(), chapter.getChapterIndex());
            chapters.add(chapterDTO);
        });

        return new BookMetaDTO(book.getTitle(), book.getAuthor(), chapters);

    }

    @Transactional(readOnly = true)
    public Map<String, Object> getBookResources(Long BookId, Long userId) throws ResourceNotFoundException, IOException {
        UserBook userBook = userBookRepository.findByUserIdAndBookId(userId, BookId).orElseThrow(() ->
        new ResourceNotFoundException("UserBook not found with bookId: " + BookId + " and User Id: " + userId));

        Book book = userBook.getBook();
        String relativeFilePath = book.getFilePath();
        if(relativeFilePath == null || relativeFilePath.isBlank()){
            throw new ResourceNotFoundException("Book file path is missing for bookId: " + BookId);
        }
        Path absoluteFilePath = Path.of(uploadDir).resolve(relativeFilePath);
        Resource bookData = new FileSystemResource(absoluteFilePath);

        if(!bookData.exists() || !bookData.isReadable()){
            throw new NoSuchFileException("EPUB not found or readable at path: " + absoluteFilePath);
        }

        Map<String, Object> bookInfo = new HashMap<>();
        bookInfo.put("fileName", relativeFilePath);
        bookInfo.put("bookData", bookData);

        return bookInfo;
    }

    public ChapterContentDTO getChapterContent(Long bookId, Integer chapterIndex) throws IOException, EpubProcessingException, ResourceNotFoundException {
        Book book = bookRepository.findById(bookId).orElseThrow(() -> new ResourceNotFoundException("Book", bookId.toString()));
        Chapter chapter = chapterRepository.findByBookIdAndChapterIndex(bookId, chapterIndex);
        if(chapter == null){
            throw new ResourceNotFoundException("Chapter", "BookId: " + bookId + ", ChapterIndex: " + chapterIndex);
        }

        Path epubPath = Path.of(uploadDir).resolve(book.getFilePath());
        if(!Files.exists(epubPath)){
            log.error("Epub file does not exist at path: {}", epubPath);
            throw new IOException("Epub file does not exist at path: " + epubPath);
        }

        return new ChapterContentDTO(EpubParser.parseContent(epubPath, chapter.getFilePath(),chapter.getAnchor()));


    }

    public Map<String, Object> getCoverImage(Long bookId, Long userId) throws ResourceNotFoundException {
        Optional<UserBook> userBook = userBookRepository.findByUserIdAndBookId(userId, bookId);


        //If no matching UserBook is found for this user and filename, deny access
        if (userBook.isEmpty()) {
            log.warn("UserBook not found for bookId: {} and userId: {}", bookId, userId);
            throw new ResourceNotFoundException("UserBook not found for bookId: " + bookId + " and userId: " + userId);
        }

        Book book = userBook.get().getBook();
        String coverImagePath = book.getCoverImagePath();
        if(coverImagePath == null || coverImagePath.isBlank()){
            log.warn("Book cover image path is missing for bookId: {}", bookId);
            throw new ResourceNotFoundException("Book cover image path is missing for bookId: " + bookId);
        }

        Path absoluteCoverImagePath = Path.of(uploadDir).resolve(coverImagePath);
        Resource resource = new FileSystemResource(absoluteCoverImagePath);

        if(!resource.exists()){
            log.error("Cover image file missing at path {} for user {}, despite DB record.", absoluteCoverImagePath, userId);
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
