package com.example.springreader.repository;

import com.example.springreader.model.Chapter;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ChapterRepository extends JpaRepository<Chapter, Long> {

    Chapter findByBookIdAndChapterIndex(Long bookId, Integer chapterIndex);
}
