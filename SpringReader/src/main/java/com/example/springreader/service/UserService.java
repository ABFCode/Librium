package com.example.springreader.service;

import com.example.springreader.dto.LoginRequest;
import com.example.springreader.dto.LoginResponse;
import com.example.springreader.model.User;
import com.example.springreader.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class UserService {
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;



    public LoginResponse authenticate(LoginRequest loginRequest) {
        return userRepository.findByUsername(loginRequest.username())
                .filter(user -> passwordEncoder.matches(loginRequest.password(), user.getPassword()))
                .map(user -> LoginResponse.success(jwtService.generateToken(user)))
                .orElse(LoginResponse.FAILURE);
    }

    public boolean register(String username, String password) {
        if (userRepository.findByUsername(username).isPresent()) {
            return false;
        }

        User newUser = new User(username, passwordEncoder.encode(password));
        userRepository.save(newUser);
        return true;
    }
}
