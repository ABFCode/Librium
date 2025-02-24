package com.example.springreader.service;

import com.example.springreader.model.User;
import com.example.springreader.repository.UserRepository;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class UserInitService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    @PostConstruct
    public void createInitialUser() {
        if (userRepository.findByUsername("debug").isEmpty()) {
            User user = new User();
            user.setUsername("debug");
            // Hash the password!  Important for security
            user.setPassword(passwordEncoder.encode("123"));
            userRepository.save(user);
            System.out.println("Initial user created: debug");
        } else {
            System.out.println("Initial user already exists.");
        }
    }
}
