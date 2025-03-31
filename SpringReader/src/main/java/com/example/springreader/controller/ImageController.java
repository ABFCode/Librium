package com.example.springreader.controller;

import com.example.springreader.exception.ResourceNotFoundException;
import com.example.springreader.model.User;
import com.example.springreader.model.UserBook;
import com.example.springreader.service.UserBookService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
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

@RestController
@RequestMapping("/api/covers")
@RequiredArgsConstructor
@Slf4j
public class ImageController {

    private final String uploadDir;
    private final UserBookService userBookService;

    @GetMapping("/{filename}")
    public ResponseEntity<Resource> getCoverImage(@PathVariable String filename, @AuthenticationPrincipal User user) {

        Optional<UserBook> userBook = userBookService
                .getUserBooks(user.getId())
                .stream()
                .filter(ub -> ub.getBook().getCoverImagePath().endsWith(filename))
                .findFirst();

        if (userBook.isEmpty()){
            log.warn("Could not find cover image at {} for user {}", filename, user.getUsername());

            throw new ResourceNotFoundException("Cover Image", "Filename: " + filename + "User: " + user.getUsername());
        }


        Path filePath = Path.of(uploadDir, "covers", filename);
        Resource resource = new FileSystemResource(filePath);




        if(!resource.exists()){
            log.error("Cover image {} for user {} could not be found despite DB record existing for it.", filename, user.getUsername());
            throw new ResourceNotFoundException("Cover Image", user.getUsername());
        }


        MediaType contentType = MediaType.IMAGE_JPEG;
        if(filename.toLowerCase().endsWith(".png")){
            contentType = MediaType.IMAGE_PNG;
        }

        return ResponseEntity.ok()
                .contentType(contentType)
                .body(resource);

    }
}
