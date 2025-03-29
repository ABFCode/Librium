package com.example.springreader.controller;

import com.example.springreader.dto.BookMetaDTO;
import com.example.springreader.dto.ChapterContentDTO;
import com.example.springreader.repository.BookRepository;
import com.example.springreader.service.LibraryService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * This controller provides endpoints for handling EPUB files, allowing the retrieval
 * of chapters and metadata associated with a given book in the DB.
 */
@RestController
@RequestMapping("/api/epub")
@Slf4j
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
     * @param bookId id of the book stored in the db
     * @param index the chapter index to be retrieved from the EPUB file
     * @return a ResponseEntity containing a map of chapter content if successful,
     * or an error message if failure
     */
    @GetMapping("{bookId}/chapter/{index}")
    public ResponseEntity<ChapterContentDTO> getEpubChapter(
            @PathVariable Long bookId,
            @PathVariable Integer index){
        try {
//            Book book = bookRepository.findById(id).orElseThrow();
//            File epubFile = new File(book.getFilePath());
//            Map<String, Object> chapter = EpubParser.parseContent(epubFile, index);
            ChapterContentDTO chapterContentDTO = libraryService.getChapterContent(bookId, index);
            return ResponseEntity.ok(chapterContentDTO);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(null);
        }

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
        try{
//            Book book = bookRepository.findById(id).orElseThrow();
//
//            //File epubFile = new File("src/main/resources/files/book1.epub");
//            File epubFile = new File(book.getFilePath());
            BookMetaDTO meta = libraryService.getBookMeta(bookId);

            //System.out.println("Flat TOC: " + meta.get("flatToc"));
            return ResponseEntity.ok(meta);
        }
        catch(Exception e){
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(null);
        }
    }




}
