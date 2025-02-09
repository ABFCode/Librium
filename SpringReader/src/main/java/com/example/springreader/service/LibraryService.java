package com.example.springreader.service;

import com.example.springreader.model.Book;
import com.example.springreader.repository.BookRepository;
import com.example.springreader.utility.EpubParser;
import org.springframework.stereotype.Service;

import java.io.File;
import java.util.List;
import java.util.Map;

@Service
public class LibraryService {
    private final BookRepository bookRepository;

    public LibraryService(BookRepository bookRepository){
        this.bookRepository = bookRepository;
    }


    public Book addBook(File epubFile){
        Map<String, Object> meta = EpubParser.parseMeta(epubFile);
        String title = (String) meta.getOrDefault("title", "No title");
        String author = (String) meta.getOrDefault("author", "No author");

        Book book = new Book(title, author, epubFile.getAbsolutePath());
        return  bookRepository.save(book);

    }

    public List<Book> ListAll(){
        return bookRepository.findAll();
    }


}
