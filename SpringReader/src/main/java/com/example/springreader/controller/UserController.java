package com.example.springreader.controller;

import com.example.springreader.dto.LoginRequest;
import com.example.springreader.dto.LoginResponse;
import com.example.springreader.service.UserService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/user")
public class UserController {
    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }


    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(@RequestBody LoginRequest loginRequest){
        LoginResponse response = userService.authenticate(loginRequest);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/register")
    public ResponseEntity<String> register(@RequestBody LoginRequest registrationRequest) {
        boolean success = userService.register(registrationRequest.username(), registrationRequest.password());

        if(success) {
            return ResponseEntity.ok("Registration was successful");
        }
        else{
            return ResponseEntity.badRequest().body("This username already exists");
        }
    }
}
