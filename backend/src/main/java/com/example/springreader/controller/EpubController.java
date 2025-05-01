package com.example.springreader.controller;

import com.example.springreader.dto.BookMetaDTO;
import com.example.springreader.dto.ChapterContentDTO;
import com.example.springreader.model.User;
import com.example.springreader.repository.UserBookRepository;
import com.example.springreader.service.LibraryService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.util.Map;

/**
 * REST controller for accessing EPUB book content.
 * Provides endpoints to retrieve specific chapters and metadata for books stored in the system.
 */
@RestController
@RequestMapping("/api/epub")
@Slf4j
@RequiredArgsConstructor
public class EpubController {

    private final LibraryService libraryService;
    private final UserBookRepository userBookRepository;


    /**
     * Retrieves the content of a specific chapter from a book identified by its ID.
     *
     * @param bookId The unique ID of the book.
     * @param index  The zero-based index of the chapter to retrieve.
     * @return A ResponseEntity containing the chapter content DTO upon success.
     * @throws IOException if an error occurs during file processing by the service layer.
     */
    @GetMapping("/{bookId}/chapter/{index}")
    public ResponseEntity<ChapterContentDTO> getEpubChapter(
            @PathVariable Long bookId,
            @PathVariable Integer index,
    @AuthenticationPrincipal User user) throws IOException {

        ChapterContentDTO chapterContentDTO = libraryService.getChapterContent(bookId, user.getId(), index);
        return ResponseEntity.ok(chapterContentDTO);
    }


    /**
     * Retrieves the metadata (like title, author, etc.) for a book identified by its ID.
     *
     * @param bookId The unique ID of the book.
     * @return A ResponseEntity containing the book metadata DTO upon success.
     */
    @GetMapping("/{bookId}/meta")
    public ResponseEntity<BookMetaDTO> getEpubMeta(@PathVariable Long bookId, @AuthenticationPrincipal User user) {
        BookMetaDTO bookMetaDTO = libraryService.getBookMeta(bookId, user.getId());
        return ResponseEntity.ok(bookMetaDTO);
    }


    @GetMapping("/{bookId}/cover")
    public ResponseEntity<Resource> getCoverImage(@PathVariable Long bookId, @AuthenticationPrincipal User user) {
        Map<String, Object> coverImageInfo = libraryService.getCoverImage(bookId, user.getId());
        Resource resource = (Resource) coverImageInfo.get("coverImage");
        MediaType contentType = (MediaType) coverImageInfo.get("contentType");

        return ResponseEntity.ok().contentType(contentType).body(resource);
    }
}