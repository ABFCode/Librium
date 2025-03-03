package com.example.springreader.repository;

import com.example.springreader.model.UserBook;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface UserBookRepository extends JpaRepository<UserBook, Long> {
    List<UserBook> findByUserId(Long userId);
    Optional<UserBook> findByUserIdAndBookId(Long userId, Long bookId);

}