package com.example.springreader.service;

import com.example.springreader.model.User;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.util.Base64;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;
import java.util.function.Function;

/**
 * Service class that provides methods for generating, parsing, and validating JWT tokens.
 */
@Slf4j
@Service
public class JwtService {

    private final SecretKey key;

    public JwtService(@Value("${JWT_SECRET}") String secret){
        if(secret == null || secret.isBlank()){
            throw new IllegalArgumentException("JWT secret cannot be null or empty");
        }
        this.key = Keys.hmacShaKeyFor(Base64.getDecoder().decode(secret));

    }



    /**
     * Convenience method, for generating tokens when we don't have extra claims to add on.
     * Passes in an empty hashmap representing any extra claims (none in the case we're using this method)
     * @param user The user for which we are generating a token
     * @return a JWT token as a string
     */
    public String generateToken(User user) {
        return generateToken(new HashMap<>(), user);
    }



    /**
     * Generates a JWT token for a specified user.
     *
     * @param extraClaims a map of additional claims to include in the token (will always be empty in current impl.)
     * @param user the user details for which the token is being generated
     * @return a JWT token as a string
     */
    public String generateToken(Map<String, Object> extraClaims, User user){
        long expirationMs = 86400000; //24 hours
        return Jwts.builder()
                .claims(extraClaims)
                .subject(user.getUsername())
                .issuedAt(new Date(System.currentTimeMillis()))
                .expiration(new Date(System.currentTimeMillis() + expirationMs))
                .signWith(key)
                .compact();
    }

    /**
     * Extracts the username from a given JWT token.
     *
     * @param token the JWT token from which the username should be extracted
     * @return the username from the token
     */
    public String extractUsername(String token) {
        return extractClaim(token, claims -> claims.getSubject());
    }

    /**
     * Validates a JWT token against the provided user details. Right now we are only checking
     * if the extracted username matches the user given by the passed in user or if it is expired.
     *
     * @param token the JWT token to be validated
     * @param user the user to verify the token's ownership
     * @return true if the token is valid and belongs to the provided user
     */
    public boolean isTokenValid(String token, User user){
        final String username = extractUsername(token);
        return(username.equals(user.getUsername())) && !isTokenExpired(token);
    }

    /**
     * Extracts a specific claim from a given JWT token using the provided claims resolver function.
     * Claims can be in many times, so this needs to be generic. (data/string/int)
     *
     * @param <T> the type of the claim to be returned
     * @param token the JWT token from which the claim is to be extracted
     * @param claimsResolver a function that defines how to extract the desired claim from the token's claims
     * @return the extracted claim of type T
     */
    public <T> T extractClaim(String token, Function<Claims, T> claimsResolver) {
        final Claims claims =
                extractAllClaims(token);
        return claimsResolver.apply(claims);
    }

    /**
     * Extracts all claims from a given JWT token. Used to verify the token's signature before extracting
     * as well as parsing it into a trusted Claims object.
     *
     * @param token the JWT token that we are extracting from
     * @return the claims contained in the token
     * @throws JwtException if the token is invalid or cannot be parsed
     */
    private Claims extractAllClaims(String token){
        try{
            return Jwts.parser()
                    .verifyWith(key)
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();
        }
        catch (JwtException e) {
            log.error("JWT token is invalid: {}", e.getMessage());
            throw e;
        }
    }

    /**
     * Checks if the token is it has expired by seeing if expiration data is before now
     * @param token token to check
     * @return if expired: true
     */
    private boolean isTokenExpired(String token){
        return extractExpiration(token)
                .before(new Date());
    }

    /**
     * Extracts the expiration date
     *
     * @param token extract expiration data from
     * @return the expiration date of the token as a Date
     */
    private Date extractExpiration(String token){
        return extractClaim(token, claims -> claims.getExpiration());
    }


}
