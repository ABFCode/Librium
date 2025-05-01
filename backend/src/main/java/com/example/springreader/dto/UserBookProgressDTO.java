package com.example.springreader.dto;

/**
 * DTO used for transferring user-specific book progress.
 * Contains the ID of the book and the index of the last chapter read by the user.
 */
public record UserBookProgressDTO(Long bookId, Integer lastChapterIndex) {
}