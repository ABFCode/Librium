package com.example.springreader.repository;

import com.example.springreader.model.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

/**
 * Repository interface for performing CRUD operations on the User entity.
 * Extends JpaRepository, which provides standard database operations for us automatically implemented.
 *
 */
public interface UserRepository extends JpaRepository<User, Long> {
    //Spring Data JPA will automatically implement this:
    //find: Search operation
    //By: what follows is search criteria
    //Username: Field name to search for
    //SELECT * FROM users WHERE username = ?
    Optional<User> findByUsername(String username);
}
