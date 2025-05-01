package com.example.springreader.dto;

/**
 * Represents a login request with a username and password.
 */
public record LoginRequest(String username, String password) {
}
