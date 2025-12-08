package com.example.springreader.dto;

public record BookPopularityDTO(
    Integer userCount,
    Double averageRating,
    Integer favoriteCount,
    Integer notesCount,
    Integer totalRatings
) {}

