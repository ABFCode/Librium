package com.example.springreader.repository;

import com.example.springreader.model.BookImage;
import com.example.springreader.model.ImageType;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface BookImageRepository extends JpaRepository<BookImage, Long> {
    List<BookImage> findByBookId(Long bookId);
    Optional<BookImage> findByBookIdAndImageType(Long bookId, ImageType imageType);
}