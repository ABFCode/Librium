package com.example.springreader.dto;

import java.util.List;

/**
 * DTO representing the metadata of a book, including its title, author,
 * and a list of its chapters (as ChapterDTOs).
 */
public record BookMetaDTO(String title, String author, List<ChapterDTO> chapters) {
}