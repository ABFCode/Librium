package com.example.springreader.service;

import com.example.springreader.repository.BookRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * Service responsible for initializing the app with some default books.
 * Only populates if DB is empty on startup.
 */
@Service
@Slf4j
public class BookInitService {
    private final BookRepository bookRepository;
    //change to @value
    private final String BOOKS_PATH = "src/main/resources/files/defaults";


    public BookInitService(BookRepository bookRepository){
        this.bookRepository = bookRepository;
    }


    /**
     *  Executed automatically after our service is finished being constructed.
     *
     * Checks if the book repository is empty. If empty, it attempts to read
     * EPUB files from the default directory, extract metadata, and saves the book.
     *
     */
//    @PostConstruct //Marks a method that should be executed after the object has been constructed
//    public void init(){
//        if(bookRepository.count() == 0){
//            log.info("Book Init is starting");
//            try{
//
//            File defaultBooksDir = new File(BOOKS_PATH);
//
//            //Need to make a filter, ensure we are looking at epub files
//            if(defaultBooksDir.isDirectory()){
//                File[] epubFiles = defaultBooksDir.listFiles();
//
//                if (epubFiles != null) {
//                    for(File epub: epubFiles) {
//                        Map<String, Object> meta = EpubParser.parseMeta(epub);
//                        String title = EpubParser.getTitle(meta);
//                        String author = EpubParser.getAuthor(meta);
//
//                        Book book = new Book(
//                                title,
//                                author,
//                                epub.getAbsolutePath()
//                        );
//                        bookRepository.save(book);
//                    }
//                }
//            }
//            } catch (Exception e) {
//                log.error("Error getting epubs from default", e);
//
//            }
//
//        }
//        else{
//            log.info("No need to init books as there are already books in the DB");
//        }
//        log.info("Init completed");
//    }

}
