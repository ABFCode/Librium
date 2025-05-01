package com.example.springreader.service;

import com.example.springreader.model.User;
import com.example.springreader.repository.UserRepository;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * Service responsible for creating an initial 'debug' user upon application startup.
 * Intended for development/testing to allow quick login without manual registration.
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class UserInitService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    /**
     * Creates the default 'debug' user after service initialization if it doesn't already exist.
     * Uses a hardcoded username ('debug') and password ('123'), encoding the password before saving.
     */
    @PostConstruct
    public void createInitialUser() {
        if (userRepository.findByUsername("debug").isEmpty()) {
            User user = new User();
            user.setUsername("debug");
            user.setPassword(passwordEncoder.encode("123")); //Encode password
            userRepository.save(user);
            log.info("Initial user 'debug' created.");
        } else {
            log.info("Initial user 'debug' already exists in DB.");
        }
    }
}
