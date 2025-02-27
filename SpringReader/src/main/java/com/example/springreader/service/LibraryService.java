package com.example.springreader.service;

import com.example.springreader.model.Book;
import com.example.springreader.repository.BookRepository;
import com.example.springreader.utility.EpubParser;
import org.springframework.stereotype.Service;

import java.io.File;
import java.util.List;
import java.util.Map;

/**
 * Provides methods to interact with our bookRepo thereby interacting with our DB. Right now we can jsut add a book
 * and list all of them.
 */
@Service
public class LibraryService {
    private final BookRepository bookRepository;

    public LibraryService(BookRepository bookRepository){
        this.bookRepository = bookRepository;
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

        Book book = new Book(title, author, epubFile.getAbsolutePath());
        return  bookRepository.save(book);
    }

    /**
     * Lists all books
     * @return A list of all books in our DB
     */
   public List<Book> ListAll(){
        return bookRepository.findAll();
    }


}
