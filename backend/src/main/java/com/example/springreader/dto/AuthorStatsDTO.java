package com.example.springreader.dto;

public record AuthorStatsDTO(
    Long authorId,
    String authorName,
    Integer bookCount
) {}

