package com.example.springreader.dto;

/**
 * DTO representing a single chapter, typically used for table of contents.
 * Contains the chapter title, an optional anchor for locating it within its content file,
 * and its index within the book.
 */
public record ChapterDTO(String title, String anchor, int index) {
}