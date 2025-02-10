package com.example.springreader.controller;

import com.example.springreader.model.Book;
import com.example.springreader.repository.BookRepository;
import com.example.springreader.utility.EpubParser;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.File;
import java.util.Collections;
import java.util.Map;

@RestController
@RequestMapping("/epub")
@CrossOrigin(origins = "http://localhost:5173")
public class EpubController {
    private final BookRepository bookRepository;

    public EpubController(BookRepository bookRepository) {
        this.bookRepository = bookRepository;
    }
    //File epubFile = new File("src/main/resources/files/pg11.epub");

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


    @GetMapping("/{id}/meta")
    public ResponseEntity<Map<String, Object>> getEpubMeta(@PathVariable Long id){
        try{
            Book book = bookRepository.findById(id).orElseThrow();

            //File epubFile = new File("src/main/resources/files/book1.epub");
            File epubFile = new File(book.getFilePath());
            Map<String, Object> meta = EpubParser.parseMeta(epubFile);
            return ResponseEntity.ok(meta);
        }
        catch(Exception e){
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Collections.singletonMap("error", e.getMessage()));
        }
    }
}
