package com.example.springreader.controller;

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
    //File epubFile = new File("src/main/resources/files/pg11.epub");

    @GetMapping("/{index}")
    public ResponseEntity<Map<String, Object>> getEpubChapter(@PathVariable Integer index){
        try {
            File epubFile = new File("src/main/resources/files/pg11.epub");
            Map<String, Object> chapter = EpubParser.parseContent(epubFile, index);
            return ResponseEntity.ok(chapter);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Collections.singletonMap("error", e.getMessage()));
        }

    }
}
