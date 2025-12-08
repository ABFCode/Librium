package com.example.springreader.service;

import com.example.springreader.dto.AuthorStatsDTO;
import com.example.springreader.dto.BookPopularityDTO;
import com.example.springreader.dto.RecentBookDTO;
import com.example.springreader.dto.UserReadingStatsDTO;
import com.example.springreader.repository.StatsRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Service layer for statistics and analytics operations.
 * Handles mapping database function results to DTOs for consumption by controllers.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class StatsService {
    private final StatsRepository statsRepository;

    /**
     * Retrieves comprehensive reading statistics for a specific user.
     *
     * @param userId The ID of the user to get statistics for.
     * @return UserReadingStatsDTO containing total books, chapters read, words read, favorites, and ratings.
     */
    @Transactional(readOnly = true)
    public UserReadingStatsDTO getUserReadingStats(Long userId) {
        List<Object[]> results = statsRepository.getUserReadingStats(userId);
        if (results.isEmpty()) {
            return new UserReadingStatsDTO(0, 0, 0, 0, 0);
        }
        Object[] row = results.get(0);
        return new UserReadingStatsDTO(
            ((Number) row[0]).intValue(),
            ((Number) row[1]).intValue(),
            ((Number) row[2]).intValue(),
            ((Number) row[3]).intValue(),
            ((Number) row[4]).intValue()
        );
    }

    /**
     * Retrieves popularity metrics for a specific book.
     *
     * @param bookId The ID of the book to get popularity stats for.
     * @return BookPopularityDTO containing user count, average rating, favorite count, notes count, and total ratings.
     */
    @Transactional(readOnly = true)
    public BookPopularityDTO getBookPopularity(Long bookId) {
        List<Object[]> results = statsRepository.getBookPopularity(bookId);
        if (results.isEmpty()) {
            return new BookPopularityDTO(0, 0.0, 0, 0, 0);
        }
        Object[] row = results.get(0);
        BigDecimal avgRating = (BigDecimal) row[1];
        return new BookPopularityDTO(
            ((Number) row[0]).intValue(),
            avgRating != null ? avgRating.doubleValue() : 0.0,
            ((Number) row[2]).intValue(),
            ((Number) row[3]).intValue(),
            ((Number) row[4]).intValue()
        );
    }

    /**
     * Retrieves the total word count for a specific book by summing all chapter word counts.
     *
     * @param bookId The ID of the book to get word count for.
     * @return The total word count as an Integer.
     */
    @Transactional(readOnly = true)
    public Integer getBookWordCount(Long bookId) {
        return statsRepository.getBookWordCount(bookId);
    }

    /**
     * Retrieves all authors with their associated book counts, ordered by popularity.
     *
     * @return List of AuthorStatsDTO objects containing author ID, name, and book count.
     */
    @Transactional(readOnly = true)
    public List<AuthorStatsDTO> getAuthorsWithBookCounts() {
        List<Object[]> results = statsRepository.getAuthorsWithBookCounts();
        return results.stream()
            .map(row -> new AuthorStatsDTO(
                ((Number) row[0]).longValue(),
                (String) row[1],
                ((Number) row[2]).intValue()
            ))
            .collect(Collectors.toList());
    }

    /**
     * Retrieves recently accessed books for a specific user, ordered by last accessed time.
     *
     * @param userId The ID of the user to get recent books for.
     * @param limit Maximum number of recent books to return.
     * @return List of RecentBookDTO objects containing book ID, title, last accessed time, and last chapter index.
     */
    @Transactional(readOnly = true)
    public List<RecentBookDTO> getRecentlyAccessedBooks(Long userId, Integer limit) {
        List<Object[]> results = statsRepository.getRecentlyAccessedBooks(userId, limit);
        return results.stream()
            .map(row -> new RecentBookDTO(
                ((Number) row[0]).longValue(),
                (String) row[1],
                ((Timestamp) row[2]).toLocalDateTime(),
                ((Number) row[3]).intValue()
            ))
            .collect(Collectors.toList());
    }
}

