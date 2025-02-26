package com.example.springreader.model;


import lombok.Getter;

import java.util.ArrayList;
import java.util.List;


/**
 * Represents our complete ToC, a list of EpubContentFiles.
 * Where each contentFile is a html literal file within the epub that holds one or more chapters within it.
 */
@Getter
public class EpubToc {
    private final List<EpubContentFile> contentFiles = new ArrayList<>();

    public void addContentFile(EpubContentFile contentFile) {
        this.contentFiles.add(contentFile);
    }
}