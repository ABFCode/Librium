package com.example.springreader.controller;

import com.example.springreader.exception.ResourceNotFoundException;
import com.example.springreader.model.User;
import com.example.springreader.model.UserBook;
import com.example.springreader.service.UserBookService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value; // Import @Value
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.nio.file.Path;
import java.util.Optional;

/**
 * REST controller for serving book cover images.
 * Ensures that users can only access cover images for books in their library.
 */
@RestController
@RequestMapping("/api/covers")
@RequiredArgsConstructor
@Slf4j
public class ImageController {

    @Value("${upload.dir}")
    private final String uploadDir;
    private final UserBookService userBookService;

    /**
     * Retrieves the cover image file for a specific book, but only if the book
     * belongs to the currently authenticated user's library.
     *
     * @param filename The filename of the cover image ("cover.jpg").
     * @param user     The currently authenticated user, injected by Spring Security.
     * @return A ResponseEntity containing the image resource if found and authorized.
     * @throws ResourceNotFoundException if the image file doesn't exist, or if the user
     *                                   does not have the associated book in their library.
     */
    @GetMapping("/{filename}")
    public ResponseEntity<Resource> getCoverImage(@PathVariable String filename, @AuthenticationPrincipal User user) {

        Optional<UserBook> userBook = userBookService
                .getUserBooks(user.getId())
                .stream()
                .filter(ub -> ub.getBook().getCoverImagePath().endsWith(filename))
                .findFirst();

        //If no matching UserBook is found for this user and filename, deny access
        if (userBook.isEmpty()){
            log.warn("User {} attempted to access cover image '{}' not associated with their books.", user.getUsername(), filename);
            throw new ResourceNotFoundException("Cover Image", "Filename: " + filename + ", User: " + user.getUsername());
        }

        //Construct the full path to the image file
        Path filePath = Path.of(uploadDir, "covers", filename);
        Resource resource = new FileSystemResource(filePath);

        //Check if the physical file exists on the server
        if(!resource.exists()){
            log.error("Cover image file missing at path {} for user {}, despite DB record.", filePath, user.getUsername());
            throw new ResourceNotFoundException("Cover Image File", "Path: " + filePath);
        }

        //Determine the content type based on the file extension
        MediaType contentType = MediaType.IMAGE_JPEG; //Default to JPEG
        if(filename.toLowerCase().endsWith(".png")){
            contentType = MediaType.IMAGE_PNG;
        }
        return ResponseEntity.ok()
                .contentType(contentType)
                .body(resource);
    }
}