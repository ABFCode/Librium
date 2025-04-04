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


}
