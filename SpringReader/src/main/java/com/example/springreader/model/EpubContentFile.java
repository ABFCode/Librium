package com.example.springreader.model;

import lombok.Getter;

import java.util.ArrayList;
import java.util.List;

/**
 * This class represents a content file for the epub that holds a list of chapters that are within it. Could be just one.
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