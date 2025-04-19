package com.example.springreader.repository;

import com.example.springreader.model.Chapter;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Spring Data JPA repository for chapter entities.
 */
public interface ChapterRepository extends JpaRepository<Chapter, Long> {

    /**
     * Finds a specific chapter by its associated book's ID and its index within that book.
     * Spring Data JPA automatically implements this query based on the method name.
     */
    Chapter findByBookIdAndChapterIndex(Long bookId, Integer chapterIndex);
}