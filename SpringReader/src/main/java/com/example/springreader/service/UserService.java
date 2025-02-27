package com.example.springreader.service;

import com.example.springreader.dto.LoginRequest;
import com.example.springreader.dto.LoginResponse;
import com.example.springreader.model.User;
import com.example.springreader.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

/**
 * Service class responsible for user-related operations like authentication
 * and registration
 */
@Service
@RequiredArgsConstructor
public class UserService {
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;


    /**
     * Authenticates a user based on a given login request.
     * The method validates the username and password, and if successful,
     * generates a JWT token to be sent back to the user.
     *
     * @param loginRequest the login request containing the username and password.
     * @return an object containing a success or failure status,
     *         and a generated JWT token if the authentication is successful
     */
    public LoginResponse authenticate(LoginRequest loginRequest) {
        return userRepository.findByUsername(loginRequest.username())
                .filter(user -> passwordEncoder.matches(loginRequest.password(), user.getPassword()))
                .map(user -> LoginResponse.success(jwtService.generateToken(user)))
                .orElse(LoginResponse.FAILURE);
    }


    /**
     * Registers a new user. Does not log them in or pass them a JWT token.
     * Only creates a user from their details and saves to DB.
     *
     * @param loginRequest login request record, contains just a user/pass
     * @return if username is already present false, else true
     */
    public boolean register(LoginRequest loginRequest) {
        if (userRepository.findByUsername(loginRequest.username()).isPresent()) {
            return false;
        }

        User newUser = new User(loginRequest.username(), passwordEncoder.encode(loginRequest.password()));
        userRepository.save(newUser);
        return true;
    }
}
