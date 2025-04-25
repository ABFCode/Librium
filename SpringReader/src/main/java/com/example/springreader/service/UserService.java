package com.example.springreader.service;

import com.example.springreader.dto.LoginRequest;
import com.example.springreader.exception.UsernameAlreadyExistsException;
import com.example.springreader.model.Book;
import com.example.springreader.model.User;
import com.example.springreader.model.UserBook;
import com.example.springreader.repository.BookRepository;
import com.example.springreader.repository.UserBookRepository;
import com.example.springreader.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

/**
 * Service class responsible for user-related operations like authentication
 * and registration.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class UserService {
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final BookRepository bookRepository;
    private final UserBookRepository userBookRepository;


    /**
     * Authenticates a user based on provided credentials.
     * Verifies the username exists and the provided password matches the stored hash.
     * If successful, generates and returns a JWT token for the user.
     *
     * @param loginRequest DTO containing the username and password attempt.
     * @return A JWT token string upon successful authentication.
     * @throws BadCredentialsException if the username is not found or the password does not match.
     */
    public String authenticate(LoginRequest loginRequest) {
        //Find user, check password match, generate token, or throw exception
        String lowercaseUsername = loginRequest.username().toLowerCase();
        return userRepository.findByUsername(lowercaseUsername)
                .filter(user -> passwordEncoder.matches(loginRequest.password(), user.getPassword()))
                .map(jwtService::generateToken)
                .orElseThrow(() -> new BadCredentialsException("Invalid username or password"));
    }


    /**
     * Registers a new user in the system.
     * Checks if the username already exists. If not, encodes the password,
     * saves the new user, and associates the default book with the user.
     *
     * @param loginRequest DTO containing the desired username and password.
     * @throws UsernameAlreadyExistsException if the requested username is already taken.
     */
    @Transactional
    public void register(LoginRequest loginRequest) {
        String lowercaseUsername = loginRequest.username().toLowerCase();
        if (userRepository.findByUsername(lowercaseUsername).isPresent()) {
            throw new UsernameAlreadyExistsException(loginRequest.username());
        }

        //Create and save the new user with encoded password
        User newUser = new User(lowercaseUsername, passwordEncoder.encode(loginRequest.password()));
        userRepository.save(newUser);
        log.info("Registered new user: {}", newUser.getUsername());

        //Associate default book with new user
        Optional<Book> defaultBookOpt = bookRepository.findByisDefaultTrue();
        if(defaultBookOpt.isPresent()){
            Book defaultBook = defaultBookOpt.get();
            UserBook userBook = new UserBook();
            userBook.setUser(newUser);
            userBook.setBook(defaultBook);
            userBookRepository.save(userBook);
            log.info("Associated default book (ID: {}) with new user: {}", defaultBook.getId(), newUser.getUsername());
        }
        else{
            //This should never happen, BookInitService is broken.
            log.error("Default book not found in DB during registration for user: {}", newUser.getUsername());
        }
    }
}
