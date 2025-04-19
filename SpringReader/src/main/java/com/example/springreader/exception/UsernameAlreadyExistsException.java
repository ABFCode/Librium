package com.example.springreader.exception;

/**
 * Custom exception thrown when an attempt is made to register a user
 * with a username that is already present in the system.
 */
public class UsernameAlreadyExistsException extends RuntimeException{
    public UsernameAlreadyExistsException(String username) {
        super("Username " + username + " already exists");
    }

}