package com.example.springreader.security.filter;

import com.example.springreader.model.User;
import com.example.springreader.service.JwtService;
import com.example.springreader.service.MyUserDetailsService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.NonNull;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * A filter that intercepts incoming requests once per request to process JWT authentication.
 * It extracts the JWT from cookies, validates it, and if valid, sets the user authentication
 * details in the Spring Security context.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class JwtAuthenticationFilter extends OncePerRequestFilter {
    private final JwtService jwtService;
    private final MyUserDetailsService userDetailsService;

    /**
     * Processes the incoming HTTP request to perform JWT authentication.
     * Extracts the JWT from the "jwt" cookie, validates it, and sets the
     * security context if the token is valid and no authentication is present.
     *
     * @param request     The incoming HttpServletRequest.
     * @param response    The outgoing HttpServletResponse.
     * @param filterChain The filter chain to pass the request along.
     * @throws ServletException If a servlet-specific error occurs.
     * @throws IOException      If an I/O error occurs.
     */
    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request, @NonNull HttpServletResponse response, @NonNull FilterChain filterChain) throws ServletException, IOException {
        final String jwt = extractJwtFromCookies(request);
        final String username;

        //If no JWT is found in cookies, proceed without authentication for this filter.
        if (jwt == null) {
            filterChain.doFilter(request, response);
            return;
        }

        try {
            username = jwtService.extractUsername(jwt);

            //If username extracted and no authentication context exists yet
            if (username != null && SecurityContextHolder.getContext().getAuthentication() == null) {
                //Load user details (implicitly checks if user exists)
                User user = (User) this.userDetailsService.loadUserByUsername(username);

                //Validate the token against the loaded user details
                if (jwtService.isTokenValid(jwt, user)) {
                    //Create authentication token
                    UsernamePasswordAuthenticationToken authToken = new UsernamePasswordAuthenticationToken(
                            user,
                            null, // No credentials needed as we used JWT
                            user.getAuthorities()
                    );
                    //Set authentication in the security context
                    SecurityContextHolder.getContext().setAuthentication(authToken);
                    log.debug("Successfully authenticated user '{}' via JWT.", username);
                } else {
                     log.warn("Invalid JWT token received for user '{}'.", username);
                }
            }
        } catch (Exception e) {
            log.error("Could not set user authentication in security context: {}", e.getMessage());
        }

        //Continue the filter chain
        filterChain.doFilter(request, response);
    }

    /**
     * Extracts the JWT value from the "jwt" cookie in the request.
     *
     * @param request The HttpServletRequest containing the cookies.
     * @return The JWT string if the "jwt" cookie is found, otherwise null.
     */
    private String extractJwtFromCookies(@NonNull HttpServletRequest request) {
        if (request.getCookies() != null) {
            for (Cookie cookie : request.getCookies()) {
                if ("jwt".equals(cookie.getName())) {
                    return cookie.getValue();
                }
            }
        }
        return null;
    }
}