package com.example.springreader.dto;

import java.util.List;

public record BookMetaDTO(String title, String author, List<ChapterDTO> chapters) {
}
