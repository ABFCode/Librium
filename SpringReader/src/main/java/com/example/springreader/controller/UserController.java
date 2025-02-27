package com.example.springreader.controller;

import com.example.springreader.dto.LoginRequest;
import com.example.springreader.dto.LoginResponse;
import com.example.springreader.service.UserService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Controller class for handling user operations like authentication and registration.
 */
@RestController
@RequestMapping("/api/user")
public class UserController {
    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }


    /**
     * Authenticates a user using a given loginRequest (user/pass)
     *
     * @param loginRequest the login request containing user & pass
     * @return a ResponseEntity containing a LoginResponse object with authentication details and status
     */
    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(@RequestBody LoginRequest loginRequest){
        LoginResponse response = userService.authenticate(loginRequest);
        return ResponseEntity.ok(response);
    }

    /**
     * Registers a new user in the system using provided details (user/pass).
     *
     * @param registrationRequest the registration request containing username and password
     * @return a ResponseEntity containing a success message if registration is successful,
     *         or an error if the username already exists
     */
    @PostMapping("/register")
    public ResponseEntity<String> register(@RequestBody LoginRequest registrationRequest) {
        boolean success = userService.register(registrationRequest);

        if(success) {
            return ResponseEntity.ok("Registration was successful");
        }
        else{
            return ResponseEntity.badRequest().body("This username already exists");
        }
    }
}
