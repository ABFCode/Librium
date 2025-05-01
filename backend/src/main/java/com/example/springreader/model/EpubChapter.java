package com.example.springreader.model;

/**
 * Represents metadata for a single chapter extracted from an EPUB Table of Contents.
 * This includes information needed to locate and display the chapter content.
 *
 * @param title The title of the chapter.
 * @param anchor An optional anchor identifier within the chapter's content file.
 * @param index The sequential index of the chapter based on its order in the TOC.
 * @param filePath The path to the content file within the EPUB archive containing this chapter.
 */
public record EpubChapter(String title, String anchor, int index, String filePath) {}