package com.example.springreader.service;

import com.example.springreader.model.Book;
import com.example.springreader.repository.BookRepository;
import com.example.springreader.utility.EpubParser;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.File;
import java.util.Map;

@Service
@Slf4j
public class BookInitService {
    private final BookRepository bookRepository;
    private final String BOOKS_PATH = "src/main/resources/files/defaults";


    public BookInitService(BookRepository bookRepository){
        this.bookRepository = bookRepository;
    }

    @PostConstruct //Marks a method that should be executed after the object has been constructed
    public void init(){
        if(bookRepository.count() == 0){
            log.info("Init is starting");
            try{

            File defaultBooksDir = new File(BOOKS_PATH);

            if(defaultBooksDir.isDirectory()){
                File[] epubFiles = defaultBooksDir.listFiles();

                if (epubFiles != null) {
                    for(File epub: epubFiles){
                        Map<String, Object> meta = EpubParser.parseMeta(epub);
                        String title = (String) meta.get("title");
                        String author = (String) meta.get("author");
                        Book book = new Book(
                                title,
                                author,
                                epub.getAbsolutePath()
                        );
                        bookRepository.save(book);
                    }
                }
            }
            } catch (Exception e) {
                log.error("Error getting epubs from default", e);

            }

        }
        else{
            log.info("No need to init books as there are already books in the DB");
        }
        log.info("Init completed");
    }

}
