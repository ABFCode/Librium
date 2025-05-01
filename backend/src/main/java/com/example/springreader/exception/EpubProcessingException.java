package com.example.springreader.exception;

/**
 * Custom exception thrown when an error occurs during the processing
 * or parsing of an EPUB file.
 */
public class EpubProcessingException extends RuntimeException{
    public EpubProcessingException(String message) {
        super(message);
    }

}