package com.example.springreader.service;

import com.example.springreader.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

/**
 * Service class that implements Spring Security's UserDetailsService.
 * It is responsible for loading user-specific data (like UserDetails)
 * based on the username provided during the authentication process.
 */
@Service
@RequiredArgsConstructor
public class MyUserDetailsService implements UserDetailsService {

    private final UserRepository userRepository;

    /**
     * Locates the user based on the username. Currently case-sensitive.
     *
     * @param username the username identifying the user whose data is required.
     * @return a fully populated user record (never null)
     * @throws UsernameNotFoundException if the user could not be found
     */
    @Override
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        String lowercaseUsername = username.toLowerCase();
        return userRepository.findByUsername(lowercaseUsername)
                .orElseThrow(() -> new UsernameNotFoundException("User not found: " + username));
    }
}
