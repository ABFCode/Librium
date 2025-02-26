package com.example.springreader.service;

import com.example.springreader.model.User;
import lombok.extern.slf4j.Slf4j;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

@Slf4j
class JwtServiceTest {

    private JwtService jwtService;
    private User validUser;

    @BeforeEach
    void setUp() {
        jwtService = new JwtService();
        validUser = new User("valid", "123");
    }
    /**
     * Tests that a token is successfully generated for a valid user.
     */
    @Test
    void generateToken_ValidUser_returnsToken() {
        String token = jwtService.generateToken(validUser);

        assertNotNull(token, "Token should not be null");
        assertFalse(token.isEmpty(), "Token should not be empty");
    }

    /**
     * Tests that the username is correctly extracted from a valid token.
     */
    @Test
    void extractUsername_ValidToken_returnsUsername() {
        String token = jwtService.generateToken(validUser);

        String extractedUsername = jwtService.extractUsername(token);

        assertNotNull(extractedUsername, "Extracted username should not be null");
        assertEquals(validUser.getUsername(), extractedUsername, "Extracted username should match");
    }

    /**
     * Tests that a token is valid for the correct user.
     */
    @Test
    void isTokenValid_ValidTokenAndUser_returnsTrue() {
        String token = jwtService.generateToken(validUser);

        boolean isValid = jwtService.isTokenValid(token, validUser);

        assertTrue(isValid, "Token should be valid for the correct user");
    }

}
