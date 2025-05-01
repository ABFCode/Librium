package com.example.springreader.model;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class EpubTocTest {

    /**
     * Tests that a EpubContentFile can be added to the contentFiles list.
     */
    @Test
    void addContentFile_ValidContentFile_IsAddedSuccessfully() {
        EpubToc toc = new EpubToc();
        EpubContentFile contentFile = new EpubContentFile("chapter1.xhtml");

        toc.addContentFile(contentFile);

        assertNotNull(toc.getContentFiles());
        assertEquals(1, toc.getContentFiles().size());
        assertEquals(contentFile, toc.getContentFiles().get(0));
    }

}