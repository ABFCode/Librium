package com.example.springreader.controller;

import com.example.springreader.dto.BookMetaDTO;
import com.example.springreader.dto.ChapterContentDTO;
import com.example.springreader.service.LibraryService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;

/**
 * This controller provides endpoints for handling EPUB files, allowing the retrieval
 * of chapters and metadata associated with a given book in the DB.
 */
@RestController
@RequestMapping("/api/epub")
@Slf4j
public class EpubController {
    private final LibraryService libraryService;

    /**
     * Constructor
     * @param libraryService repository used to manage book entities, handles direct connection with DB
     */
    public EpubController(LibraryService libraryService) {
        this.libraryService = libraryService;
    }
    //File epubFile = new File("src/main/resources/files/pg11.epub");

    /**
     * gets a specific chapter from an EPUB file from with a given book.
     *
     * @param bookId id of the book stored in the db
     * @param index the chapter index to be retrieved from the EPUB file
     * @return a ResponseEntity containing a map of chapter content if successful,
     * or an error message if failure
     */
    @GetMapping("{bookId}/chapter/{index}")
    public ResponseEntity<ChapterContentDTO> getEpubChapter(
            @PathVariable Long bookId,
            @PathVariable Integer index) throws IOException {

        ChapterContentDTO chapterContentDTO = libraryService.getChapterContent(bookId, index);
        return ResponseEntity.ok(chapterContentDTO);

    }


    /**
     * gets metadata from an EPUB file from a given book
     *
     * @param bookId id of book in db to retrieve metadata from
     * @return a ResponseEntity containing a map of metadata if successful,
     *         else an error message
     */
    @GetMapping("/{bookId}/meta")
    public ResponseEntity<BookMetaDTO> getEpubMeta(@PathVariable Long bookId){
        BookMetaDTO bookMetaDTO = libraryService.getBookMeta(bookId);
        return ResponseEntity.ok(bookMetaDTO);
    }




}
