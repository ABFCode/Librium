package com.example.springreader.model;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

/**
 * This class represents an individual Book
 *
 * The Book entity contains basic information such as title, author,
 * and file path indicating the storage location of the book's content.
 * It is annotated with JPA-related annotations for persistence.
 *
 * An instance of this class can be created using the parameterized
 * constructor to set the title, author, and file path.
 */
@Entity
@Data
@Table(name = "books")
@NoArgsConstructor
public class Book {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;


    private String title;
    private String author;

    private String filePath;

    private String coverImagePath;

    @OneToMany(mappedBy = "book", cascade = CascadeType.ALL)
    @OrderBy("chapterIndex ASC")
    private List<Chapter> chapters = new ArrayList<>();


    public void addChapter(Chapter chapter){
        chapters.add(chapter);
    }

    public Book(String title, String author, String filePath, String coverImagePath){
        this.title = title;
        this.author = author;
        this.filePath = filePath;
        this.coverImagePath = coverImagePath;
        chapters = new ArrayList<>();
    }
}
