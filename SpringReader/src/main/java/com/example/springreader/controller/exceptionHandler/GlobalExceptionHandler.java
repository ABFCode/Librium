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
import java.nio.file.AccessDeniedException;
import java.time.Instant;

@RestControllerAdvice
@Slf4j
public class GlobalExceptionHandler {


    @ExceptionHandler(Exception.class)
    public ProblemDetail handleGenericException(Exception e){
        log.error("An unexpected error occurred: {}", e.getMessage());

        ProblemDetail problemDetail = ProblemDetail.forStatusAndDetail(
                HttpStatus.INTERNAL_SERVER_ERROR, "An unexpected error occurred."
        );
        problemDetail.setTitle("Unexpected Error");
        problemDetail.setProperty("timestamp", Instant.now());

        return problemDetail;
    }

    @ExceptionHandler(org.springframework.security.access.AccessDeniedException.class)
    public ProblemDetail handleAccessDeniedException(AccessDeniedException e){
        log.warn("Access denied: {}", e.getMessage());

        ProblemDetail problemDetail = ProblemDetail.forStatusAndDetail(
                HttpStatus.FORBIDDEN, "Access to the resource is forbidden."
        );
        problemDetail.setTitle("Access Denied");
        problemDetail.setProperty("timestamp", Instant.now());

        return problemDetail;
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ProblemDetail handleIllegalArgumentException(IllegalArgumentException e){
        log.warn("Illegal argument: {}", e.getMessage());
        ProblemDetail problemDetail = ProblemDetail.forStatusAndDetail(
                HttpStatus.BAD_REQUEST, "The request was invalid."
        );
        problemDetail.setTitle("Illegal Argument");
        problemDetail.setProperty("timestamp", Instant.now());

        return problemDetail;
    }

    @ExceptionHandler(ResourceNotFoundException.class)
    public ProblemDetail handleResourceNotFoundException(ResourceNotFoundException e){
        log.warn("Resource not found: {}", e.getMessage());

        ProblemDetail problemDetail = ProblemDetail.forStatusAndDetail(
                HttpStatus.NOT_FOUND, "The resource could not be found."
        );
        problemDetail.setTitle("Resource Not Found");
        problemDetail.setProperty("timestamp", Instant.now());
        return problemDetail;
    }

    @ExceptionHandler(EpubProcessingException.class)
    public ProblemDetail handleEpubProcessingException(EpubProcessingException e){
        log.warn("Epub processing error: {}", e.getMessage());
        ProblemDetail problemDetail = ProblemDetail.forStatusAndDetail(
                HttpStatus.INTERNAL_SERVER_ERROR, "An error occurred while processing the file."
        );
        problemDetail.setTitle("Epub Processing Error");
        problemDetail.setProperty("timestamp", Instant.now());
        return problemDetail;
    }


    @ExceptionHandler(UsernameAlreadyExistsException.class)
    public ProblemDetail handleUsernameAlreadyExistsException(UsernameAlreadyExistsException e){
        log.warn("Username already exists: {}", e.getMessage());
        ProblemDetail problemDetail = ProblemDetail.forStatusAndDetail(
                HttpStatus.CONFLICT, "The username is already taken."
        );
        problemDetail.setTitle("Username Already Exists");
        problemDetail.setProperty("timestamp", Instant.now());
        return problemDetail;
    }


    @ExceptionHandler(BadCredentialsException.class)
    public ProblemDetail handleBadCredentialsException(BadCredentialsException e){
        log.warn("Bad credentials: {}", e.getMessage());
        ProblemDetail problemDetail = ProblemDetail.forStatusAndDetail(
                HttpStatus.UNAUTHORIZED, "Invalid username or password."
        );
        problemDetail.setTitle("Bad Credentials");
        problemDetail.setProperty("timestamp", Instant.now());
        return problemDetail;
    }


    @ExceptionHandler(IOException.class)
    public ProblemDetail handleIOException(IOException e){
        log.warn("IO error: {}", e.getMessage());
        ProblemDetail problemDetail = ProblemDetail.forStatusAndDetail(
                HttpStatus.INTERNAL_SERVER_ERROR, "An error occurred while processing the file."
        );
        problemDetail.setTitle("IO Error");
        problemDetail.setProperty("timestamp", Instant.now());
        return problemDetail;
    }
}
