package com.example.springreader.model;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import lombok.Data;
import lombok.NoArgsConstructor;

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
@NoArgsConstructor
public class Book {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;


    private String title;
    private String author;

    private String filePath;


    public Book(String title, String author, String filePath){
        this.title = title;
        this.author = author;
        this.filePath = filePath;
    }
}
