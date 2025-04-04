package com.example.springreader.repository;

import com.example.springreader.model.Book;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;


/**
 * Repository interface for performing CRUD operations on our Book entity
 *
 * Extends JpaRepository, providing a bunch of standard database operations
 *
 * The generic parameters specify the type of the entity (Book) and the type of its
 * primary key (Long).
 *
 * Spring Data JPA automatically generates the implementation at runtime, enabling
 * interaction with the database without the need for boilerplate code.
 */
public interface BookRepository extends JpaRepository<Book, Long> {

    Optional<Book> findByisDefaultTrue();

}
