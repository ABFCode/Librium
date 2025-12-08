package com.example.springreader.model;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

/**
 * Represents the association between a User and a Book.
 * It also stores the user's reading progress for that specific book.
 */
@Entity
@Table(name = "user_books")
@Data
@NoArgsConstructor
public class UserBook {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * The user associated with this library entry.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false) // Maps to the user_id foreign key column
    private User user;

    /**
     * The book associated with this library entry.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "book_id", nullable = false) // Maps to the book_id foreign key column
    private Book book;

    @Column(nullable = false)
    private Integer lastChapterIndex = 0;

    @CreationTimestamp
    @Column(updatable = false)
    private LocalDateTime createdAt;

//    @UpdateTimestamp
    private LocalDateTime lastAccessed;


}