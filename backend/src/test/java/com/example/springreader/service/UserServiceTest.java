package com.example.springreader.service;


import org.junit.jupiter.api.extension.ExtendWith;

import org.mockito.junit.jupiter.MockitoExtension;


/**
 * Unit tests for the UserService class.
 * Focuses on testing authentication and registration logic
 */
@ExtendWith(MockitoExtension.class)
class UserServiceTest {

//    @Mock
//    private UserRepository userRepository;
//    @Mock
//    private PasswordEncoder passwordEncoder;
//    @Mock
//    private JwtService jwtService;
//    @Mock
//    private BookRepository bookRepository;
//    @Mock
//    private UserBookRepository userBookRepository;
//
//    @InjectMocks
//    private UserService userService;
//
//    private User testUser;
//    private Book defaultBook;
//    private LoginRequest loginRequest;
//    private LoginRequest registrationRequest;

//    @BeforeEach
//    void setUp() {
//        testUser = new User("testuser", "hashedPassword");
//        testUser.setId(1L);
//
//        defaultBook = new Book("Default Title", "Default Author", "path/default.epub", "path/cover.jpg");
//        defaultBook.setId(99L);
//        defaultBook.setDefault(true);
//
//        loginRequest = new LoginRequest("testuser", "rawPassword");
//        registrationRequest = new LoginRequest("newuser", "newPassword");
//    }
//
//    // --- Authentication Tests ---
//
//    @Test
//    @DisplayName("authenticate should return JWT token on valid credentials")
//    void authenticate_Success() {
//        //Arrange: Configure mocks for successful authentication
//        when(userRepository.findByUsername(loginRequest.username()))
//                .thenReturn(Optional.of(testUser));
//        when(passwordEncoder.matches(loginRequest.password(), testUser.getPassword()))
//                .thenReturn(true);
//        when(jwtService.generateToken(testUser))
//                .thenReturn("mockJwtToken");
//
//        //Act: Call the method under test
//        String token = userService.authenticate(loginRequest);
//
//        //Assert: Check the results and interactions
//        assertNotNull(token);
//        assertEquals("mockJwtToken", token);
//        verify(userRepository).findByUsername(loginRequest.username());
//        verify(passwordEncoder).matches(loginRequest.password(), testUser.getPassword());
//        verify(jwtService).generateToken(testUser);
//    }
//
//    @Test
//    @DisplayName("authenticate should throw BadCredentialsException if user not found")
//    void authenticate_UserNotFound() {
//        //Arrange: Configure userRepository to return empty optional
//        when(userRepository.findByUsername(loginRequest.username()))
//                .thenReturn(Optional.empty());
//
//        //Act & Assert: Expect the exception
//        assertThrows(org.springframework.security.authentication.BadCredentialsException.class, () -> {
//            userService.authenticate(loginRequest);
//        }, "Should throw BadCredentialsException when user is not found.");
//
//        //Verify interactions (ensure password check and token generation were not called)
//        verify(userRepository).findByUsername(loginRequest.username());
//        verify(passwordEncoder, never()).matches(anyString(), anyString());
//        verify(jwtService, never()).generateToken(any(User.class));
//    }
//
//    @Test
//    @DisplayName("authenticate should throw BadCredentialsException on wrong password")
//    void authenticate_WrongPassword() {
//        //Arrange: Configure passwordEncoder to return false
//        when(userRepository.findByUsername(loginRequest.username()))
//                .thenReturn(Optional.of(testUser));
//        when(passwordEncoder.matches(loginRequest.password(), testUser.getPassword()))
//                .thenReturn(false); // Simulate password mismatch
//
//        //Act & Assert: Expect the exception
//        assertThrows(BadCredentialsException.class, () -> {
//            userService.authenticate(loginRequest);
//        }, "Should throw BadCredentialsException for incorrect password.");
//
//        //Verify interactions (ensure token generation was not called)
//        verify(userRepository).findByUsername(loginRequest.username());
//        verify(passwordEncoder).matches(loginRequest.password(), testUser.getPassword());
//        verify(jwtService, never()).generateToken(any(User.class));
//    }
//
//    // --- Registration Tests ---
//
//    @Test
//    @DisplayName("register should save user and link default book on success")
//    void register_Success() {
//        //Arrange: Configure mocks for successful registration
//        when(userRepository.findByUsername(registrationRequest.username()))
//                .thenReturn(Optional.empty()); // User does not exist
//        when(passwordEncoder.encode(registrationRequest.password()))
//                .thenReturn("encodedNewPassword");
//        when(bookRepository.findByisDefaultTrue())
//                .thenReturn(Optional.of(defaultBook));
//
//        ArgumentCaptor<User> userCaptor = ArgumentCaptor.forClass(User.class);
//        ArgumentCaptor<UserBook> userBookCaptor = ArgumentCaptor.forClass(UserBook.class);
//
//        //Act: Call the method under test
//        assertDoesNotThrow(() -> {
//            userService.register(registrationRequest);
//        }, "Registration should not throw an exception on success.");
//
//        //Assert: Verify interactions and captured arguments
//        verify(userRepository).findByUsername(registrationRequest.username());
//        verify(passwordEncoder).encode(registrationRequest.password());
//        verify(userRepository).save(userCaptor.capture()); // Capture the saved User
//        verify(bookRepository).findByisDefaultTrue();
//        verify(userBookRepository).save(userBookCaptor.capture()); // Capture the saved UserBook
//
//
//        User savedUser = userCaptor.getValue();
//        assertEquals(registrationRequest.username(), savedUser.getUsername());
//        assertEquals("encodedNewPassword", savedUser.getPassword());
//
//        UserBook savedUserBook = userBookCaptor.getValue();
//        assertNotNull(savedUserBook.getUser());
//        assertEquals(registrationRequest.username(), savedUserBook.getUser().getUsername());
//        assertEquals(defaultBook.getId(), savedUserBook.getBook().getId());
//    }
//
//    @Test
//    @DisplayName("register should throw UsernameAlreadyExistsException if username exists")
//    void register_UsernameExists() {
//        //Arrange: Configure userRepository to find an existing user
//        when(userRepository.findByUsername(registrationRequest.username()))
//                .thenReturn(Optional.of(testUser)); // Simulate user already exists
//
//        //Act & Assert: Expect the exception
//        assertThrows(UsernameAlreadyExistsException.class, () -> {
//            userService.register(registrationRequest);
//        }, "Should throw UsernameAlreadyExistsException when username is taken.");
//
//        //Verify that no save operations occurred
//        verify(userRepository).findByUsername(registrationRequest.username());
//        verify(passwordEncoder, never()).encode(anyString());
//        verify(userRepository, never()).save(any(User.class));
//        verify(bookRepository, never()).findByisDefaultTrue();
//        verify(userBookRepository, never()).save(any(UserBook.class));
//    }
//
//    @Test
//    @DisplayName("register should complete even if default book not found (logs error)")
//    void register_Success_DefaultBookNotFound() {
//        //Arrange: Configure mocks for registration but no default book
//        when(userRepository.findByUsername(registrationRequest.username()))
//                .thenReturn(Optional.empty());
//        when(passwordEncoder.encode(registrationRequest.password()))
//                .thenReturn("encodedNewPassword");
//        when(bookRepository.findByisDefaultTrue())
//                .thenReturn(Optional.empty());
//
//        ArgumentCaptor<User> userCaptor = ArgumentCaptor.forClass(User.class);
//
//        //Act: Call the method under test
//        assertDoesNotThrow(() -> {
//            userService.register(registrationRequest);
//        }, "Registration should still complete if default book is not found.");
//
//        //Assert: Verify user was saved, but UserBook was not
//        verify(userRepository).findByUsername(registrationRequest.username());
//        verify(passwordEncoder).encode(registrationRequest.password());
//        verify(userRepository).save(userCaptor.capture());
//        verify(bookRepository).findByisDefaultTrue();
//        verify(userBookRepository, never()).save(any(UserBook.class)); //Crucial check
//
//        //Check the captured User object
//        User savedUser = userCaptor.getValue();
//        assertEquals(registrationRequest.username(), savedUser.getUsername());
//        assertEquals("encodedNewPassword", savedUser.getPassword());
//    }
}
