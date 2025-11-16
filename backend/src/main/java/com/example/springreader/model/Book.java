package com.example.springreader.model;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * Represents a Book entity in the application.
 * This entity stores information about a book, including its title, author,
 * file path for the content, path for the cover image, and its associated chapters.
 * An index is defined on the isDefault column for optimized querying.
 */
@Entity
@Data
@Table(name = "books", indexes = {@Index(name="idx_books_is_default", columnList = "isDefault")})
@NoArgsConstructor
public class Book {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String title = "Untitled";

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "author_id", nullable = false)
    private Author author;

    @Column(nullable = false)
    private String filePath;

    private String coverImagePath;

    /**
     * Flag indicating if this book is a default book provided with the application.
     * Defaults to false.Indexed for faster lookups.
     */
    @Column(nullable = false)
    private boolean isDefault = false;

    /**
     * A list of chapters belonging to this book.
     */
    @OneToMany(mappedBy = "book", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("chapterIndex ASC")
    private List<Chapter> chapters = new ArrayList<>();

    @CreationTimestamp
    @Column(updatable = false)
    private LocalDateTime createdAt;

    /**
     * Adds a new chapter to this book's list of chapters.
     *
     * @param chapter The Chapter to add.
     */
    public void addChapter(Chapter chapter){
        chapters.add(chapter);
    }
    public Book(String title, String filePath, String coverImagePath){
        this.title = title;
        this.filePath = filePath;
        this.coverImagePath = coverImagePath;
    }
}