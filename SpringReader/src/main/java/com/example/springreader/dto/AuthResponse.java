package com.example.springreader.dto;

/**
 *  response to a login attempt, holds a JWT token and a status.
 *
 * We use static methods to create successful or failed responses.
 */
public record AuthResponse(
        String token,
        String status
) {

    public static final AuthResponse FAILURE = new AuthResponse(null, "FAILURE");

    public static AuthResponse success(String token) {
        return new AuthResponse(token, "SUCCESS");
    }
}
