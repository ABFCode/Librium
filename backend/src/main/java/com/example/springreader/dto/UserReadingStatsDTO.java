package com.example.springreader.dto;

public record UserReadingStatsDTO(
    Integer totalBooks,
    Integer totalChaptersRead,
    Integer totalWordsRead,
    Integer favoriteBooksCount,
    Integer ratedBooksCount
) {}

