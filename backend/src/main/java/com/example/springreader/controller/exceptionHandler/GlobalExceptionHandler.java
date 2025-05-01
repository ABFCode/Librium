package com.example.springreader.controller.exceptionHandler;

import com.example.springreader.exception.EpubProcessingException;
import com.example.springreader.exception.ResourceNotFoundException;
import com.example.springreader.exception.UsernameAlreadyExistsException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.io.IOException;
import java.time.Instant;


/**
 * Global exception handler for our application.
 * This class provides centralized exception handling across all @Controllers.
 * It uses @RestControllerAdvice to apply its exception handling logic globally.
 */
@RestControllerAdvice
@Slf4j
public class GlobalExceptionHandler {


    /**
     * Handles generic exceptions that are not specifically caught by other handlers.
     * This serves as a fallback for unexpected errors.
     *
     * @param e The Exception that was thrown.
     * @return A ProblemDetail object indicating an internal server error.
     */
    @ExceptionHandler(Exception.class)
    public ProblemDetail handleGenericException(Exception e){
        log.error("An unexpected error occurred: {}", e.getMessage(), e);

        ProblemDetail problemDetail = ProblemDetail.forStatusAndDetail(
                HttpStatus.INTERNAL_SERVER_ERROR, "An unexpected error occurred."
        );
        problemDetail.setTitle("Unexpected Error");
        problemDetail.setProperty("timestamp", Instant.now());

        return problemDetail;
    }

    /**
     * Handles AccessDeniedException, typically thrown by Spring Security when authorization fails.
     *
     * @param e The AccessDeniedException that was thrown.
     * @return A ProblemDetail object indicating forbidden access (403).
     */
    @ExceptionHandler(org.springframework.security.access.AccessDeniedException.class)
    public ProblemDetail handleAccessDeniedException(org.springframework.security.access.AccessDeniedException e){
        log.warn("Access denied: {}", e.getMessage());

        ProblemDetail problemDetail = ProblemDetail.forStatusAndDetail(
                HttpStatus.FORBIDDEN, "Access to the resource is forbidden."
        );
        problemDetail.setTitle("Access Denied");
        problemDetail.setProperty("timestamp", Instant.now());

        return problemDetail;
    }

    /**
     * Handles IllegalArgumentException, typically thrown when a method receives an invalid argument.
     *
     * @param e The IllegalArgumentException that was thrown.
     * @return A ProblemDetail object indicating a bad request (400).
     */
    @ExceptionHandler(IllegalArgumentException.class)
    public ProblemDetail handleIllegalArgumentException(IllegalArgumentException e){
        log.warn("Illegal argument: {}", e.getMessage());
        ProblemDetail problemDetail = ProblemDetail.forStatusAndDetail(
                HttpStatus.BAD_REQUEST, "The request contained an invalid argument."
        );
        problemDetail.setTitle("Illegal Argument");
        problemDetail.setProperty("timestamp", Instant.now());

        return problemDetail;
    }

    /**
     * Handles ResourceNotFoundException, a custom exception indicating a requested resource does not exist.
     *
     * @param e The ResourceNotFoundException that was thrown.
     * @return A ProblemDetail object indicating that the resource was not found (404).
     */
    @ExceptionHandler(ResourceNotFoundException.class)
    public ProblemDetail handleResourceNotFoundException(ResourceNotFoundException e){
        log.warn("Resource not found: {}", e.getMessage());

        String userFriendlyDetail;
        if (e.getMessage() != null && e.getMessage().startsWith("UserBook not found")) {
            userFriendlyDetail = "The requested book either does not exist, was not found in your library or could not be accessed.";
        } else if (e.getMessage() != null && e.getMessage().startsWith("Book cover image path is missing")) {
            userFriendlyDetail = "The cover image for this book could not be found.";
        } else if (e.getMessage() != null && e.getMessage().startsWith("Cover Image File")) {
            userFriendlyDetail = "The cover image file could not be found.";
        }
        else {
            userFriendlyDetail = "The resource you requested could not be found.";
        }



        ProblemDetail problemDetail = ProblemDetail.forStatusAndDetail(
                HttpStatus.NOT_FOUND, userFriendlyDetail
        );
        problemDetail.setTitle("Resource Not Found");
        problemDetail.setProperty("timestamp", Instant.now());
        return problemDetail;
    }

    /**
     * Handles EpubProcessingException, a custom exception for errors during EPUB file processing.
     *
     * @param e The EpubProcessingException that was thrown.
     * @return A ProblemDetail object indicating an internal server error related to file processing.
     */
    @ExceptionHandler(EpubProcessingException.class)
    public ProblemDetail handleEpubProcessingException(EpubProcessingException e){
        log.error("Epub processing error: {}", e.getMessage(), e);
        ProblemDetail problemDetail = ProblemDetail.forStatusAndDetail(
                HttpStatus.INTERNAL_SERVER_ERROR, "An error occurred while processing the EPUB file."
        );
        problemDetail.setTitle("Epub Processing Error");
        problemDetail.setProperty("timestamp", Instant.now());
        return problemDetail;
    }


    /**
     * Handles UsernameAlreadyExistsException, a custom exception for user registration conflicts.
     *
     * @param e The UsernameAlreadyExistsException that was thrown.
     * @return A ProblemDetail object indicating a conflict due to the username already being taken (409).
     */
    @ExceptionHandler(UsernameAlreadyExistsException.class)
    public ProblemDetail handleUsernameAlreadyExistsException(UsernameAlreadyExistsException e){
        log.warn("Username already exists: {}", e.getMessage());
        ProblemDetail problemDetail = ProblemDetail.forStatusAndDetail(
                HttpStatus.CONFLICT, e.getMessage()
        );
        problemDetail.setTitle("Username Already Exists");
        problemDetail.setProperty("timestamp", Instant.now());
        return problemDetail;
    }


    /**
     * Handles BadCredentialsException, thrown by Spring Security for authentication failures (invalid username/password).
     *
     * @param e The BadCredentialsException that was thrown.
     * @return A ProblemDetail object indicating unauthorized access due to invalid credentials (401).
     */
    @ExceptionHandler(BadCredentialsException.class)
    public ProblemDetail handleBadCredentialsException(BadCredentialsException e){
        log.warn("Bad credentials attempt: {}", e.getMessage());
        ProblemDetail problemDetail = ProblemDetail.forStatusAndDetail(
                HttpStatus.UNAUTHORIZED, "Invalid username or password."
        );
        problemDetail.setTitle("Authentication Failed");
        problemDetail.setProperty("timestamp", Instant.now());
        return problemDetail;
    }


    /**
     * Handles IOException, typically occurring during file read/write operations.
     *
     * @param e The IOException that was thrown.
     * @return A ProblemDetail object indicating an internal server error related to I/O operations.
     */
    @ExceptionHandler(IOException.class)
    public ProblemDetail handleIOException(IOException e){
        log.error("IO error: {}", e.getMessage(), e);
        ProblemDetail problemDetail = ProblemDetail.forStatusAndDetail(
                HttpStatus.INTERNAL_SERVER_ERROR, "An input/output error occurred."
        );
        problemDetail.setTitle("IO Error");
        problemDetail.setProperty("timestamp", Instant.now());
        return problemDetail;
    }
}