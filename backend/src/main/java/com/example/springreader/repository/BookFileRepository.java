package com.example.springreader.repository;

import com.example.springreader.model.BookFile;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface BookFileRepository extends JpaRepository<BookFile, Long> {
    Optional<BookFile> findByBookId(Long bookId);
}