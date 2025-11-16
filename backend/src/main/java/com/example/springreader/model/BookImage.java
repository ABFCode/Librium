package com.example.springreader.model;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "book_images")
@Data
@NoArgsConstructor
public class BookImage {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String filePath;

    @Column(nullable = false)
    private String mediaType;

    @Column(nullable = false)
    private Long fileSize;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ImageType imageType;

    private Integer width;

    private Integer height;

    @CreationTimestamp
    @Column(updatable = false)
    private LocalDateTime createdAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "book_id", nullable = false)
    private Book book;

    public BookImage(String filePath, String mediaType, Long fileSize, ImageType imageType, Book book) {
        this.filePath = filePath;
        this.mediaType = mediaType;
        this.fileSize = fileSize;
        this.imageType = imageType;
        this.book = book;
    }
}