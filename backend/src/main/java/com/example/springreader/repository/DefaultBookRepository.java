package com.example.springreader.repository;

import com.example.springreader.model.DefaultBook;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;


public interface DefaultBookRepository extends JpaRepository<DefaultBook, Long> {
}
