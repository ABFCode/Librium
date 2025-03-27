package com.example.springreader.service;

import com.example.springreader.model.Book;
import com.example.springreader.model.EpubChapter;
import com.example.springreader.model.EpubContentFile;
import com.example.springreader.model.EpubToc;
import com.example.springreader.repository.BookRepository;
import com.example.springreader.utility.EpubParser;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;

/**
 * Provides methods to interact with our bookRepo thereby interacting with our DB. Right now we can jsut add a book
 * and list all of them.
 */
@Slf4j
@Service
public class LibraryService {
    private final BookRepository bookRepository;
    private final String uploadDir;

    public LibraryService(BookRepository bookRepository, String uploadDir){
        this.bookRepository = bookRepository;
        this.uploadDir = uploadDir;
    }


    /**
     * Adds a new book to the repository (which will save it to our DB)
     *
     * @param epubFile the EPUB file containing the book's info
     * @return the saved Book object
     */
    public Book addBook(File epubFile){
        Map<String, Object> meta = EpubParser.parseMeta(epubFile);
        String title = EpubParser.getTitle(meta);
        String author = EpubParser.getAuthor(meta);
        String coverImagePath = null;

        Optional<Map<String, Object>> coverImageData = EpubParser.extractCoverImage(epubFile);

        if(coverImageData.isPresent()){
            //log.info("Found cover image");
            byte[] image = (byte[]) coverImageData.get().get("coverImage");
            String mediaType = (String) coverImageData.get().get("mediaType");

            String fileExtension = mediaType.split("/")[1];

            try{
                Path coverDir = Path.of(uploadDir, "covers");
                if(!Files.exists(coverDir)){
                    Files.createDirectories(coverDir);
                    //log.info("Created covers directory");
                }

                String filename = UUID.randomUUID() + "." + fileExtension;
                coverImagePath = "/covers/" + filename;

                Files.write(coverDir.resolve(filename), image);
                //log.info("Cover image path: {}", coverImagePath);

            }
            catch(Exception e){
                log.error("Error saving cover image", e);
            }
        }
        else{
            log.error("No cover data found");
        }

        Book book = new Book(title, author, epubFile.getAbsolutePath(), coverImagePath);
        return  bookRepository.save(book);
    }








    /**
     * Lists all books
     * @return A list of all books in our DB
     */
   public List<Book> ListAll(){
        return bookRepository.findAll();
   }

    /**
     * Flatterns the toc object into a single list of epubchapter objects.
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
                    flattenedToc.add(new EpubChapter(trimmedTitle, chapter.anchor(), chapter.index()));
                }
            }
        }
        return flattenedToc;
    }


    /**
     * Retrieves the meta from our parseMeta method, flattens the toc and replaces the one in meta.
     * @param epubFile File object representing an epub
     * @return Our adjusted meta object containing the flattened toc
     */
    public Map<String, Object> getBookMeta(File epubFile){
       Map<String, Object> meta = EpubParser.parseMeta(epubFile);
        //System.out.println("Meta before flattening: " + meta);

       if (meta.containsKey("toc")){
           EpubToc toc = (EpubToc) meta.get("toc");
           List<EpubChapter> chapters = flattenToc(toc);
           meta.put("flatToc", chapters);
           meta.remove("toc");
           //System.out.println("Flattened toc: " + chapters);
       }

        //System.out.println("Meta after flattening: " + meta);
       return meta;
    }




}
