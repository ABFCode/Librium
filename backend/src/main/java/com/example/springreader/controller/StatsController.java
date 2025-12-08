package com.example.springreader.controller;

import com.example.springreader.dto.AuthorStatsDTO;
import com.example.springreader.dto.BookPopularityDTO;
import com.example.springreader.dto.RecentBookDTO;
import com.example.springreader.dto.UserReadingStatsDTO;
import com.example.springreader.model.User;
import com.example.springreader.service.StatsService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Controller for handling statistics and analytics queries.
 * Exposes endpoints for user reading stats, book popularity metrics, and author statistics.
 */
@Slf4j
@RestController
@RequestMapping("/api/stats")
@RequiredArgsConstructor
public class StatsController {
    private final StatsService statsService;

    /**
     * Retrieves reading statistics for the currently authenticated user.
     *
     * @param user The currently authenticated user making the request.
     * @return ResponseEntity containing UserReadingStatsDTO with total books, chapters read, words read, etc.
     */
    @GetMapping("/user")
    public ResponseEntity<UserReadingStatsDTO> getUserStats(@AuthenticationPrincipal User user) {
        return ResponseEntity.ok(statsService.getUserReadingStats(user.getId()));
    }

    /**
     * Retrieves popularity metrics for a specific book.
     *
     * @param bookId The ID of the book to get popularity stats for.
     * @return ResponseEntity containing BookPopularityDTO with user count, average rating, favorites, etc.
     */
    @GetMapping("/book/{bookId}")
    public ResponseEntity<BookPopularityDTO> getBookPopularity(@PathVariable Long bookId) {
        return ResponseEntity.ok(statsService.getBookPopularity(bookId));
    }

    /**
     * Retrieves the total word count for a specific book.
     *
     * @param bookId The ID of the book to get word count for.
     * @return ResponseEntity containing the total word count as an Integer.
     */
    @GetMapping("/book/{bookId}/word-count")
    public ResponseEntity<Integer> getBookWordCount(@PathVariable Long bookId) {
        return ResponseEntity.ok(statsService.getBookWordCount(bookId));
    }

    /**
     * Retrieves all authors with their associated book counts, ordered by popularity.
     *
     * @return ResponseEntity containing a list of AuthorStatsDTO objects.
     */
    @GetMapping("/authors")
    public ResponseEntity<List<AuthorStatsDTO>> getAuthorsWithBookCounts() {
        return ResponseEntity.ok(statsService.getAuthorsWithBookCounts());
    }

    /**
     * Retrieves recently accessed books for the currently authenticated user.
     *
     * @param user The currently authenticated user making the request.
     * @param limit Maximum number of recent books to return (default: 10).
     * @return ResponseEntity containing a list of RecentBookDTO objects ordered by last accessed time.
     */
    @GetMapping("/recent")
    public ResponseEntity<List<RecentBookDTO>> getRecentlyAccessedBooks(
            @AuthenticationPrincipal User user,
            @RequestParam(defaultValue = "10") Integer limit) {
        return ResponseEntity.ok(statsService.getRecentlyAccessedBooks(user.getId(), limit));
    }
}

