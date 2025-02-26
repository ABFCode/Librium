package com.example.springreader.model;

import lombok.extern.slf4j.Slf4j;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

@Slf4j
class UserTest {

    private User user;

    @BeforeEach
    void setUp() {
        user = new User("test", "123");
    }

    /**
     * Tests that the constructor initializes the username and password.
     */
    @Test
    void constructor_initializesUsernameAndPassword() {
        assertNotNull(user, "User should be initialized");
        assertEquals("test", user.getUsername(), "Username should match argument");
        assertEquals("123", user.getPassword(), "Password should match argument");
    }


    /**
     * Tests that the UserDetails methods return expected values.
     */
    @Test
    void userDetailsMethods_returnExpectedValues() {
        assertTrue(user.isAccountNonExpired(), "User should be non-expired");
        assertTrue(user.isAccountNonLocked(), "User should be non-locked");
        assertTrue(user.isCredentialsNonExpired(), "User Credentials should be non-expired");
        assertTrue(user.isEnabled(), "User should be enabled");
    }
}
