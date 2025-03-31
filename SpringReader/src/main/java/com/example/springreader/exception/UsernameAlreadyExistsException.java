package com.example.springreader.exception;

public class UsernameAlreadyExistsException extends RuntimeException{
    public UsernameAlreadyExistsException(String username) {
        super("Username " + username + " already exists");
    }

}
