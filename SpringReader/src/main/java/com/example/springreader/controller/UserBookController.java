package com.example.springreader.controller;

import com.example.springreader.dto.UserBookProgressDTO;
import com.example.springreader.model.User;
import com.example.springreader.service.UserBookService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

/**
 * Controller for handling user-specific book progress (like last read chapter).
 */
@RestController
@RequestMapping("/api/progress")
@RequiredArgsConstructor
@Slf4j
public class UserBookController {
    private final UserBookService userBookService;


    /**
     * Saves the last read chapter index for a specific book and user.
     *
     * @param progressDTO DTO containing the book ID and the last chapter index.
     * @param user The currently authenticated user making the request.
     * @return ResponseEntity indicating success (200 OK).
     */
    @PostMapping("/save")
    public ResponseEntity<Void> saveBookProgress(@RequestBody UserBookProgressDTO progressDTO, @AuthenticationPrincipal User user) {
        log.debug("Saving progress for user {} on book {}: chapter {}", user.getId(), progressDTO.bookId(), progressDTO.lastChapterIndex());
        userBookService.saveBookProgress(progressDTO, user);
        return ResponseEntity.ok().build();
    }

    /**
     * Retrieves the last known reading progress (chapter index) for a given book and user.
     *
     * @param bookId The ID of the book whose progress is being requested.
     * @param user The currently authenticated user making the request.
     * @return ResponseEntity containing the last chapter index (or 0 if no progress saved).
     */
    @GetMapping("/get")
    public ResponseEntity<Integer> getBookProgress(@RequestParam Long bookId, @AuthenticationPrincipal User user) {
        return ResponseEntity.ok(userBookService.getBookProgress(bookId, user));
    }
}