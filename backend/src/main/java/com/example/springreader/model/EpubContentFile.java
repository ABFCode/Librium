package com.example.springreader.model;

import lombok.Getter;

import java.util.ArrayList;
import java.util.List;

/**
 * Represents a single content file within an EPUB archive.
 * It holds the path to the file and a list of chapters defined within that file.
 * A single content file can contain one or more chapters.
 */
@Getter
public class EpubContentFile {
    private final String filePath;
    private final List<EpubChapter> chapters = new ArrayList<>();
    public EpubContentFile(String filePath) {
        this.filePath = filePath;
    }
    public void addChapter(EpubChapter chapter) {
        this.chapters.add(chapter);
    }
}