package com.example.springreader.dto;

import java.time.LocalDateTime;

public record RecentBookDTO(
    Long bookId,
    String bookTitle,
    LocalDateTime lastAccessed,
    Integer lastChapterIndex
) {}

