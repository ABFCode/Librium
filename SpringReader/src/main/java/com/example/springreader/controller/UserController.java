package com.example.springreader.controller;

import com.example.springreader.dto.LoginRequest;
import com.example.springreader.dto.LoginResponse;
import com.example.springreader.service.UserService;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.env.Environment;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * Controller class for handling user operations like authentication and registration.
 */
@RestController
@RequestMapping("/api/user")
public class UserController {
    private final UserService userService;
    private final Environment environment;

    public UserController(UserService userService, Environment environment) {
        this.userService = userService;
        this.environment = environment;
    }


    /**
     * Authenticates a user using a given loginRequest (user/pass)
     *
     * @param loginRequest the login request containing user & pass
     * @return a ResponseEntity containing a LoginResponse object with authentication details and status
     */
    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(@RequestBody LoginRequest loginRequest, HttpServletResponse response){
        LoginResponse loginResponse = userService.authenticate(loginRequest);

        //boolean isProd = Arrays.asList(environment.getActiveProfiles()).contains("prod");
        boolean isProd =  environment.matchesProfiles("docker | prod");

        if(loginResponse.status().equals("SUCCESS")){
            ResponseCookie jwtCookie = ResponseCookie.from("jwt", loginResponse.token())
                            .httpOnly(true)
                            .secure(isProd) //Send only over HTTPS
                            .path("/")
                            .maxAge(60 * 60 * 24 * 14)
                            .sameSite(isProd ? "Strict" : "Lax") //CSRF protection
                            .build();


            response.addHeader("Set-Cookie", jwtCookie.toString());

            return ResponseEntity.ok(new LoginResponse(null, "SUCCESS"));

        }
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(LoginResponse.FAILURE);

        //return ResponseEntity.ok(response);
    }

    /**
     * Registers a new user in the system using provided details (user/pass).
     *
     * @param registrationRequest the registration request containing username and password
     * @return a ResponseEntity containing a success message if registration is successful,
     *         or an error if the username already exists
     */
    @PostMapping("/register")
    public ResponseEntity<String> register(@RequestBody LoginRequest registrationRequest) {
        boolean success = userService.register(registrationRequest);

        if(success) {
            return ResponseEntity.ok("Registration was successful");
        }
        else{
            return ResponseEntity.badRequest().body("This username already exists");
        }
    }

    @PostMapping("/logout")
    public ResponseEntity<String> logout(HttpServletResponse response){

        boolean isProd =  environment.matchesProfiles("docker | prod");

        ResponseCookie jwtCookie = ResponseCookie.from("jwt", null)
                .httpOnly(true)
                .secure(isProd)
                .path("/")
                .maxAge(0)
                .sameSite(isProd ? "Strict" : "Lax")
                .build();

        response.addHeader("Set-Cookie", jwtCookie.toString());

        return ResponseEntity.ok("Logout successful");

    }


    //Relies on our JWTAuthFilter. If it makes it this far that means the user is authed.
    @GetMapping("/validate")
    public ResponseEntity<String> validateToken(){
        return ResponseEntity.ok("Token is valid");
    }
}
