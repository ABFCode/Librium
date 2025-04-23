package com.example.springreader.service;

import com.example.springreader.model.User;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import io.jsonwebtoken.security.SignatureException;
import lombok.extern.slf4j.Slf4j;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import javax.crypto.SecretKey;
import java.util.Base64;
import java.util.Date;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Unit tests for the JwtService class.
 * These tests verify the core functionality of JWT generation, validation,
 * and claim extraction in isolation.
 */
@Slf4j
class JwtServiceTest {

    private JwtService jwtService;
    private User testUser;

    private static final String TEST_SECRET_KEY_BASE64 = "olMWoNykZXalA5hqgAL1VvBRgPxxt9XWRS6i02fxFV4";
    private static final SecretKey TEST_SECRET_KEY = Keys.hmacShaKeyFor(Base64.getDecoder().decode(TEST_SECRET_KEY_BASE64));

    @BeforeEach
    void setUp() {
        jwtService = new JwtService(TEST_SECRET_KEY_BASE64);
        testUser = new User("testuser", "bestpassword1234567890");
        testUser.setId(1L);
    }


    @Test
    @DisplayName("Constructor should initialize successfully with valid secret")
    void constructor_ValidSecret() {
        assertDoesNotThrow(() -> new JwtService(TEST_SECRET_KEY_BASE64),
                "Constructor should not throw an exception with a valid secret.");
    }

    @Test
    @DisplayName("Constructor should throw IllegalArgumentException for null secret")
    void constructor_NullSecret() {
        assertThrows(IllegalArgumentException.class, () -> new JwtService(null),
                "Constructor should throw IllegalArgumentException for a null secret.");
    }

    @Test
    @DisplayName("Constructor should throw IllegalArgumentException for empty secret")
    void constructor_EmptySecret() {
        assertThrows(IllegalArgumentException.class, () -> new JwtService(""),
                "Constructor should throw IllegalArgumentException for an empty secret.");
    }


    // --- Token Generation Tests ---

    @Test
    @DisplayName("generateToken should return a non-null, non-empty string")
    void generateToken_ValidUser() {
        String token = jwtService.generateToken(testUser);

        assertNotNull(token, "Generated token should not be null.");
        assertFalse(token.isBlank(), "Generated token should not be empty.");
        log.info("Generated Token: {}", token);
    }

    @Test
    @DisplayName("Generated token should contain the correct username (subject)")
    void generateToken_ContainsCorrectUsername() {
        String token = jwtService.generateToken(testUser);
        String extractedUsername = jwtService.extractUsername(token);

        assertEquals(testUser.getUsername(), extractedUsername,
                "The username extracted from the token should match the user's username.");
    }

    @Test
    @DisplayName("Generated token should have an expiration date in the future")
    void generateToken_HasFutureExpiration() {
        String token = jwtService.generateToken(testUser);
        Date expirationDate = jwtService.extractClaim(token, Claims::getExpiration);
        Date now = new Date();

        assertNotNull(expirationDate, "Expiration date should not be null.");
        assertTrue(expirationDate.after(now), "Expiration date should be after the current time.");
    }

    @Test
    @DisplayName("Generated token should have an issuedAt date in the past or present")
    void generateToken_hasValidIssuedAt() {
        String token = jwtService.generateToken(testUser);
        Date issuedAtDate = jwtService.extractClaim(token, Claims::getIssuedAt);
        Date now = new Date();

        assertNotNull(issuedAtDate, "IssuedAt date should not be null.");
        assertTrue(issuedAtDate.before(now) || issuedAtDate.equals(now),
                "IssuedAt date should be before or equal to the current time.");
    }

    // --- Token Validation Tests ---

    @Test
    @DisplayName("isTokenValid should return true for a valid, non-expired token and correct user")
    void isTokenValid_ValidTokenAndUser() {
        String token = jwtService.generateToken(testUser);
        boolean isValid = jwtService.isTokenValid(token, testUser);

        assertTrue(isValid, "Token should be considered valid for the correct user and before expiration.");
    }

    @Test
    @DisplayName("isTokenValid should return false for a valid token but wrong user")
    void isTokenValid_WrongUser() {
        String token = jwtService.generateToken(testUser);
        User wrongUser = new User("anotheruser", "password");
        //wrongUser.setId(2L);

        boolean isValid = jwtService.isTokenValid(token, wrongUser);

        assertFalse(isValid, "Token should be considered invalid for a different user.");
    }

    @Test
    @DisplayName("isTokenValid should return false for an expired token")
    void isTokenValid_ExpiredToken() {
        long nowMillis = System.currentTimeMillis();
        Date issuedAt = new Date(nowMillis - TimeUnit.HOURS.toMillis(2)); //Issued 2 hours ago
        Date expiration = new Date(nowMillis - TimeUnit.HOURS.toMillis(1)); //Expired 1 hour ago

        String expiredToken = Jwts.builder()
                .subject(testUser.getUsername())
                .issuedAt(issuedAt)
                .expiration(expiration)
                .signWith(TEST_SECRET_KEY)
                .compact();

        log.info("Manually generated expired token: {}", expiredToken);

        assertThrows(ExpiredJwtException.class, () -> jwtService.isTokenValid(expiredToken, testUser),  "Expired token should cause isTokenValid to throw ExpiredJwtException.");
    }

    // --- Error Handling Tests ---

    @Test
    @DisplayName("extractUsername should throw JwtException for malformed token")
    void extractUsername_MalFormedToken() {
        String malformedToken = "superBadInvalidToken";

        assertThrows(JwtException.class, () -> jwtService.extractUsername(malformedToken),
                "Should throw JwtException when trying to extract username from malformed token.");
    }

    @Test
    @DisplayName("isTokenValid should throw JwtException for malformed token")
    void isTokenValid_MalformedToken() {
        String malformedToken = "superBadInvalidToken";

        assertThrows(JwtException.class, () -> jwtService.isTokenValid(malformedToken, testUser),
                "Should throw JwtException when trying to validate a malformed token.");
    }

    @Test
    @DisplayName("extractUsername should throw SignatureException for token signed with different key")
    void extractUsername_DifferentSignatureKey() {
        //Create a different secret key
        SecretKey differentKey = Keys.hmacShaKeyFor(Base64.getDecoder().decode("gd8Ru9oWkQLCLiYuPf5AuklFhujbrJL/gRCQhrSXIXM="));
        String tokenSignedWithDifferentKey = Jwts.builder()
                .subject(testUser.getUsername())
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + TimeUnit.HOURS.toMillis(1)))
                .signWith(differentKey)
                .compact();

        //Try to extract using the service configured with the original TEST_SECRET_KEY
        assertThrows(SignatureException.class, () -> jwtService.extractUsername(tokenSignedWithDifferentKey),
                "Should throw SignatureException for token signed with a different key.");
    }

    @Test
    @DisplayName("isTokenValid should throw SignatureException for token signed with different key")
    void isTokenValid_DifferentSignatureKey() {
        //Create a different secret key
        SecretKey differentKey = Keys.hmacShaKeyFor(Base64.getDecoder().decode("HYXYynUeXKas/OV2eb6lvFlAYyJuGoQBgjLgk/wCXLc="));
        String tokenSignedWithDifferentKey = Jwts.builder()
                .subject(testUser.getUsername())
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + TimeUnit.HOURS.toMillis(1)))
                .signWith(differentKey)
                .compact();

        //Try to validate using the service configured with the original TEST_SECRET_KEY
        assertThrows(SignatureException.class, () -> jwtService.isTokenValid(tokenSignedWithDifferentKey, testUser),
                "Should throw SignatureException for token signed with a different key during validation.");
    }
}
