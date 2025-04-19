package com.example.springreader.exception;

/**
 * Custom exception thrown when a requested resource cannot be found
 * in the system (book, chapter, or user).
 */
public class ResourceNotFoundException extends RuntimeException{
    public ResourceNotFoundException(String message) {
        super(message);
    }

    /**
     * Constructs a new ResourceNotFoundException with a message indicating
     * the type of resource and the identifier used to search for it.
     *
     * @param resourceType the type of the resource that was not found (Book, Chapter).
     * @param identifier   the identifier used to locate the resource (ID, name).
     */
    public ResourceNotFoundException(String resourceType, String identifier) {
        super(resourceType + "s not found with identifier: " + identifier);
    }
}