package com.example.springreader.controller;

import com.example.springreader.model.Book;
import com.example.springreader.repository.BookRepository;
import com.example.springreader.service.LibraryService;
import com.example.springreader.utility.EpubParser;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.File;
import java.util.Collections;
import java.util.Map;

/**
 * This controller provides endpoints for handling EPUB files, allowing the retrieval
 * of chapters and metadata associated with a given book in the DB.
 */
@RestController
@RequestMapping("/epub")
@CrossOrigin(origins = "http://localhost:5173")
public class EpubController {
    private final BookRepository bookRepository;
    private final LibraryService libraryService;

    /**
     * Constructor
     * @param bookRepository repository used to manage book entities, handles direct connection with DB
     */
    public EpubController(BookRepository bookRepository, LibraryService libraryService) {
        this.bookRepository = bookRepository;
        this.libraryService = libraryService;
    }
    //File epubFile = new File("src/main/resources/files/pg11.epub");

    /**
     * gets a specific chapter from an EPUB file from with a given book.
     *
     * @param id id of the book stored in the db
     * @param index the chapter index to be retrieved from the EPUB file
     * @return a ResponseEntity containing a map of chapter content if successful,
     * or an error message if failure
     */
    @GetMapping("{id}/chapter/{index}")
    public ResponseEntity<Map<String, Object>> getEpubChapter(
            @PathVariable Long id,
            @PathVariable Integer index){
        try {
            Book book = bookRepository.findById(id).orElseThrow();
            File epubFile = new File(book.getFilePath());
            Map<String, Object> chapter = EpubParser.parseContent(epubFile, index);
            return ResponseEntity.ok(chapter);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Collections.singletonMap("error", e.getMessage()));
        }

    }


    /**
     * gets metadata from an EPUB file from a given book
     *
     * @param id id of book in db to retrieve metadata from
     * @return a ResponseEntity containing a map of metadata if successful,
     *         else an error message
     */
    @GetMapping("/{id}/meta")
    public ResponseEntity<Map<String, Object>> getEpubMeta(@PathVariable Long id){
        try{
            Book book = bookRepository.findById(id).orElseThrow();

            //File epubFile = new File("src/main/resources/files/book1.epub");
            File epubFile = new File(book.getFilePath());
            Map<String, Object> meta = libraryService.getBookMeta(epubFile);
            return ResponseEntity.ok(meta);
        }
        catch(Exception e){
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Collections.singletonMap("error", e.getMessage()));
        }
    }
}
