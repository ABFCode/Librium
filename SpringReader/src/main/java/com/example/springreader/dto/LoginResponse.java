package com.example.springreader.dto;

/**
 *  response to a login attempt, holds a JWT token and a status.
 *
 * We use static methods to create successful or failed responses.
 */
public record LoginResponse(
        String token,
        String status
) {

    public static final LoginResponse FAILURE = new LoginResponse(null, "FAILURE");

    public static LoginResponse success(String token) {
        return new LoginResponse(token, "SUCCESS");
    }
}
