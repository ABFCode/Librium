package com.example.springreader.repository;

import com.example.springreader.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface StatsRepository extends JpaRepository<User, Long> {

    @Query(value = "SELECT * FROM get_user_reading_stats(:userId)", nativeQuery = true)
    List<Object[]> getUserReadingStats(@Param("userId") Long userId);

    @Query(value = "SELECT * FROM get_book_popularity(:bookId)", nativeQuery = true)
    List<Object[]> getBookPopularity(@Param("bookId") Long bookId);

    @Query(value = "SELECT get_book_word_count(:bookId)", nativeQuery = true)
    Integer getBookWordCount(@Param("bookId") Long bookId);

    @Query(value = "SELECT * FROM get_authors_with_book_counts()", nativeQuery = true)
    List<Object[]> getAuthorsWithBookCounts();

    @Query(value = "SELECT * FROM get_recently_accessed_books(:userId, :limit)", nativeQuery = true)
    List<Object[]> getRecentlyAccessedBooks(@Param("userId") Long userId, @Param("limit") Integer limit);
}
