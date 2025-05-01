package com.example.springreader.controller;

import com.example.springreader.dto.LoginRequest;
import com.example.springreader.service.UserService;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.env.Environment;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * Controller class for handling user operations like authentication, registration, and session management.
 */
@RestController
@RequestMapping("/api/user")
public class UserController {
    private final UserService userService;
    private final Environment environment;

    /**
     * Constructs the UserController with necessary services.
     *
     * @param userService The service handling user logic (authentication, registration).
     * @param environment The Spring environment for accessing profile information (prod, docker, dev).
     */
    public UserController(UserService userService, Environment environment) {
        this.userService = userService;
        this.environment = environment;
    }


    /**
     * Authenticates a user based on provided credentials and sets an HTTP-only JWT cookie upon success.
     *
     * @param loginRequest DTO containing username and password.
     * @param response     The HttpServletResponse to add the Set-Cookie header to.
     * @return ResponseEntity indicating success (200 OK) or failure (handled by exception handler).
     */
    @PostMapping("/login")
    public ResponseEntity<Void> login(@RequestBody LoginRequest loginRequest, HttpServletResponse response){
        String token = userService.authenticate(loginRequest);

        //Determine if running in a production-like environment for cookie security settings
        boolean isProd =  environment.matchesProfiles("docker | prod");
        ResponseCookie jwtCookie = ResponseCookie.from("jwt", token)
                        .httpOnly(true) //Prevent client-side script access
                        .secure(isProd) //Send only over HTTPS in production
                        .path("/")      //Cookie accessible for all paths
                        .maxAge(60 * 60 * 24 * 14) //14 days expiry
                        .sameSite(isProd ? "Strict" : "Lax") //CSRF protection
                        .build();


        response.addHeader("Set-Cookie", jwtCookie.toString());

        return ResponseEntity.ok().build();
    }

    /**
     * Registers a new user in the system using the provided username and password.
     *
     * @param registrationRequest DTO containing the desired username and password.
     * @return ResponseEntity indicating successful creation (201 CREATED) or failure (username exists).
     */
    @PostMapping("/register")
    public ResponseEntity<Void> register(@RequestBody LoginRequest registrationRequest) {
        userService.register(registrationRequest);
        return ResponseEntity.status(HttpStatus.CREATED).build();
    }

    /**
     * Logs out the current user by clearing the JWT authentication cookie.
     *
     * @param response The HttpServletResponse to add the expiring Set-Cookie header to.
     * @return ResponseEntity indicating success (200 OK).
     */
    @PostMapping("/logout")
    public ResponseEntity<Void> logout(HttpServletResponse response){
        boolean isProd =  environment.matchesProfiles("docker | prod");

        //Create a cookie with the same name ('jwt') but with null value and maxAge 0 to invalidate it
        ResponseCookie jwtCookie = ResponseCookie.from("jwt", null)
                .httpOnly(true)
                .secure(isProd)
                .path("/")
                .maxAge(0)
                .sameSite(isProd ? "Strict" : "Lax")
                .build();

        response.addHeader("Set-Cookie", jwtCookie.toString());

        return ResponseEntity.ok().build();
    }


    /**
     * A protected endpoint used to validate the current user's authentication status.
     * Relies on the JwtAuthenticationFilter to intercept the request and validate the JWT cookie.
     * If the request reaches this method, the user is considered authenticated.
     *
     * @return ResponseEntity indicating success (200 OK) if the token is valid.
     */
    @GetMapping("/validate")
    public ResponseEntity<Void> validateToken(){
        return ResponseEntity.ok().build();
    }
}