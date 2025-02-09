package com.example.springreader.controller;

import com.example.springreader.model.Book;
import com.example.springreader.service.LibraryService;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.io.IOException;
import java.util.List;

@RestController
@RequestMapping("/library")
public class LibraryController {
    private final LibraryService libraryService;

    public LibraryController(LibraryService libraryService){
        this.libraryService = libraryService;
    }

    @PostMapping("/upload")
    public Book uploadBook(@RequestParam("file")MultipartFile file) throws IOException {
        File uploadedFile = new File("uploads", file.getOriginalFilename());
        file.transferTo(uploadedFile);

        return libraryService.addBook(uploadedFile);
    }

    @GetMapping
    public List<Book> listBooks(){
        return libraryService.ListAll();
    }
}
