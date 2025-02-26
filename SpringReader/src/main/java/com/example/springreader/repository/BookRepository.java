package com.example.springreader.repository;

import com.example.springreader.model.Book;
import org.springframework.data.jpa.repository.JpaRepository;

//<Book: entity class that repo manages, Long: dta type of primary key of the Book entity>
public interface BookRepository extends JpaRepository<Book, Long> {

}
