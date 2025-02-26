package com.example.springreader.controller;

import com.example.springreader.model.Book;
import com.example.springreader.service.LibraryService;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.io.IOException;
import java.util.List;

/**
 * Controller class for managing books in a library.
 * allows for uploading and  retrieving a list of books.
 */
@RestController
@RequestMapping("/library")
@CrossOrigin(origins = "http://localhost:5173")
public class LibraryController {
    private final LibraryService libraryService;

    public LibraryController(LibraryService libraryService){
        this.libraryService = libraryService;
    }

    /**
     * Handles the upload of a book file and adds it to the library.
     *
     * @param file the MultipartFile containing the book to be uploaded
     * @return the Book object created and stored in the library
     * @throws IOException if an error occurs during file processing
     */
    @PostMapping("/upload")
    public Book uploadBook(@RequestParam("file") MultipartFile file) throws IOException {
        File tempFile = File.createTempFile("upload-", ".epub");
        file.transferTo(tempFile);

        return libraryService.addBook(tempFile);
    }

    @GetMapping
    public List<Book> listBooks(){
        return libraryService.ListAll();
    }
}
