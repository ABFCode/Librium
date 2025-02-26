package com.example.springreader.model;

/**
 * This represents a single chapter in our epub. There will be one or multiple of these per content File.
 * @param title The title of chapter.
 * @param anchor This is the unique id of the chapter start or container, used in order to find the chapter within
 *               the content file
 * @param index a number representing which chapter this is, though this will probably not match up with actual book
 *              chapter numbers, as all the fluff at beginning of books are often in their own chapters
 */
public record EpubChapter(String title, String anchor, int index) {}