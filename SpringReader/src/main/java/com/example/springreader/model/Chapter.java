package com.example.springreader.model;


import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Represents a Chapter entity, linked to a specific Book.
 *
 * Contains details about a chapter, such as its title, index within the book,
 * the path to its content file within the EPUB, and an optional anchor.
 * An index is defined on book_id and chapterIndex.
 */
@Entity
@NoArgsConstructor
@Table(name = "chapters", indexes = {@Index(name = "chapterBookIndex", columnList = "book_id, chapterIndex")})
@Data
public class Chapter {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String title;
    private int chapterIndex;
    private String filePath; //Path within the EPUB archive
    private String anchor; //Optional identifier within the chapter file

    /**
     * The Book to which this chapter belongs.
     * Represents the many-to-one relationship.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "book_id", nullable = false)
    private Book book;

    public Chapter(String title, int chapterIndex, String filePath, String anchor, Book book){
        this.title = title;
        this.chapterIndex = chapterIndex;
        this.filePath = filePath;
        this.anchor = anchor;
        this.book = book;
    }
}