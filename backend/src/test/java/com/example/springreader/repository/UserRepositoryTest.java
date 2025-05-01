package com.example.springreader.repository;

import com.example.springreader.model.User;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;


//Auto configures an in-memory database using JPA through hibernate, auotmatically includes all of our @Entity classes (book/user atm)
//Rolls back any transactions after each test
@DataJpaTest
public class UserRepositoryTest {

    @Autowired
    private UserRepository userRepository;

    /**
     * Tests finding a user by username when the user exists.
     */
    @Test
    void findByUsername_UserExists_ReturnsOptionalWithUser() {
        User user = new User("test", "123");
        userRepository.save(user);

        Optional<User> foundUser = userRepository.findByUsername("test");

        assertTrue(foundUser.isPresent(), "User should be found by its username");
        assertEquals("test", foundUser.get().getUsername(), "Username of user should match");
    }

    /**
     * Tests finding a user by username when the user does not exist.
     */
    @Test
    void findByUsername_UserDoesNotExist_ReturnsEmptyOptional() {
        Optional<User> foundUser = userRepository.findByUsername("idontexist");

        assertFalse(foundUser.isPresent(), "No user should exist");
    }
}