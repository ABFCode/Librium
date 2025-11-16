package com.example.springreader.model;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.io.File;
import java.time.LocalDateTime;

@Entity
@Table(name = "book_files")
@Data
@NoArgsConstructor
public class BookFile {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String filePath;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private FileFormat fileFormat;

    @Column(nullable = false)
    private Long fileSize;

    @CreationTimestamp
    @Column(updatable = false)
    private LocalDateTime createdAt;

    @OneToOne
    @JoinColumn(name = "book_id", nullable = false, unique = true)
    private Book book;

    public BookFile(String filePath, FileFormat fileFormat, Long fileSize, Book book) {
        this.filePath = filePath;
        this.fileFormat = fileFormat;
        this.fileSize = fileSize;
        this.book = book;
    }
}