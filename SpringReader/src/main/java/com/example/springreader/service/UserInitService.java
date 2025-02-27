package com.example.springreader.service;

import com.example.springreader.model.User;
import com.example.springreader.repository.UserRepository;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * Service to create an initial user for quick login.
 */
@Component
@RequiredArgsConstructor
public class UserInitService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    /**
     * After construction of service, it will check if our debug username is already in DB,
     * otherwise make a new user and add it.
     */
    @PostConstruct
    public void createInitialUser() {
        if (userRepository.findByUsername("debug").isEmpty()) {
            User user = new User();
            user.setUsername("debug");
            user.setPassword(passwordEncoder.encode("123"));
            userRepository.save(user);
            System.out.println("Initial user created: debug");
        } else {
            System.out.println("Initial user already exists.");
        }
    }
}
