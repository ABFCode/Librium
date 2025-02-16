package com.example.springreader.dto;

public record LoginResponse(
        String token,
        String status
) {
    public static final LoginResponse FAILURE = new LoginResponse(null, "FAILURE");

    public static LoginResponse success(String token) {
        return new LoginResponse(token, "SUCCESS");
    }
}