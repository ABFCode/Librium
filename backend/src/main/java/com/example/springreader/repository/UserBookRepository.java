package com.example.springreader.repository;

import com.example.springreader.model.UserBook;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

/**
 * Spring Data JPA repository for UserBook entities.
 */
public interface UserBookRepository extends JpaRepository<UserBook, Long> {
    List<UserBook> findByUserId(Long userId);
    Optional<UserBook> findByUserIdAndBookId(Long userId, Long bookId);

    @Modifying
    @Query(value = "CALL update_reading_progress(:userId, :bookId, :chapterIndex)", nativeQuery = true)
    void updateReadingProgress(@Param("userId") Long userId,
                               @Param("bookId") Long bookId,
                               @Param("chapterIndex") Integer chapterIndex);

}