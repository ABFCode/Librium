package com.example.springreader.security.config;

import com.example.springreader.security.filter.JwtAuthenticationFilter;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.authentication.AuthenticationProvider;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.Arrays;

/**
 * Security configuration class defines our application security settings for spring security.
 */
@Configuration
@EnableWebSecurity //Spring security use this instead of defaults
@RequiredArgsConstructor //Injects all final fields
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthenticationFilter;
    private final UserDetailsService userDetailsService;

    /**
     * Configures the security filter chain for the app. Each request goes through this chain first before hitting
     * our endpoints. My particular setup includes disabling CSRF (not needed when using JWT auth),
     * basic CORS setup, allowing unauthenticated access to specific endpoints (login/register/consoleDB - to be removed);
     * all other endpoints will need to be hit by an authenticated user.
     * Sets stateless session management as we're using JWTs, as well as adds our custom JWT filter.
     *The headers frameOption disable are for our console DB to work. It will be removed once we move past h2
     *
     * @param http the HttpSecurity object used to configure security for HTTP requests
     * @return our configured SecurityFilterChain
     * @throws Exception if an error occurs
     */
    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http, @Value("${cors.allowed-origins}") String allowedOrigins) throws Exception {
        http
                .csrf(csrf -> csrf.disable())
                .cors(cors -> cors.configurationSource(corsConfigurationSource(allowedOrigins)))
                .authorizeHttpRequests(auth ->
                        auth.requestMatchers("/api/user/login", "/api/user/register").permitAll()
                                .anyRequest().authenticated())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authenticationProvider(authenticationProvider())
                .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    /**
     * Creates and configures our AuthenticationProvider. It is responsible for user authentication.
     * is based on DAO(data access object) authentication, linking a provided UserDetailsService and a PasswordEncoder.
     *
     * 1. User Logins: Submitting User/Pass
     * 2. Uses our MyUserDetailsService to look up a user based on the provided username
     * 3. Uses the given password encoder to compare the submitted password with the stored one.
     *
     * @return an AuthenticationProvider instance configured to use our
     *         UserDetailsService and PasswordEncoder.
     */
    @Bean
    public AuthenticationProvider authenticationProvider() {
        DaoAuthenticationProvider authProvider = new DaoAuthenticationProvider();
        authProvider.setUserDetailsService(userDetailsService);
        authProvider.setPasswordEncoder(passwordEncoder());
        return authProvider;
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    /**
     * Provides a configuration source for CORS in our app.
     * Allows all methods and headers coming from our front end
     * @return a CorsConfigurationSource instance containing our config
     */
    @Bean
    public CorsConfigurationSource corsConfigurationSource(String allowedOrigins) {

        String[] origins = allowedOrigins.split(",");

        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(Arrays.asList(origins));
        configuration.setAllowedMethods(Arrays.asList("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(Arrays.asList("*"));
        configuration.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }
}