package com.example.springreader.model;


import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@NoArgsConstructor
@Table(name = "chapters")
@Data
public class Chapter {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;


    private String title;
    private int chapterIndex;
    private String filePath;
    private String anchor;


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
