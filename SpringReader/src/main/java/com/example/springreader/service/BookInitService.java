package com.example.springreader.service;

import com.example.springreader.model.Book;
import com.example.springreader.repository.BookRepository;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

/**
 * Service responsible for initializing the app with some default books.
 * Only populates if DB is empty on startup.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class BookInitService {
    private final BookRepository bookRepository;
    private final ResourceLoader resourceLoader;


    @Value("${default.book.path}")
    private String defaultBookPath;



    @PostConstruct
    @Transactional
    public void initializeDefaultBook(){
        Optional<Book> existingDefaultBook = bookRepository.findByisDefaultTrue();

        if(existingDefaultBook.isEmpty()){
            try {
                Resource resource = resourceLoader.getResource(defaultBookPath);
                if(!resource.exists()){
                    log.error("Default book file not found");
                }
                else{
                    log.info("Default book file found");
                }
            } catch (Exception e) {
                log.error("Error loading default book file");
            }
        }

    }


}
