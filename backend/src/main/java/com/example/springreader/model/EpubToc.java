package com.example.springreader.model;


import lombok.Getter;

import java.util.ArrayList;
import java.util.List;


/**
 * Represents the parsed Table of Contents of an EPUB file.
 * It aggregates the content files, each potentially containing multiple chapters.
 */
@Getter
public class EpubToc {
    /**
     * A list of content files that make up the EPUB's structure,
     * ordered as they appear in the TOC.
     */
    private final List<EpubContentFile> contentFiles = new ArrayList<>();
    public void addContentFile(EpubContentFile contentFile) {
        this.contentFiles.add(contentFile);
    }
}