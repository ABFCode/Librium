package com.example.springreader.controller;

import com.example.springreader.model.User;
import com.example.springreader.model.UserBook;
import com.example.springreader.service.UserBookService;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
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
public class ImageController {

    private final String uploadDir;
    private final UserBookService userBookService;

    @GetMapping("/{filename}")
    public ResponseEntity<Resource> getCoverImage(@PathVariable String filename, @AuthenticationPrincipal User user) {
        try{
            //check that the user can access the book cover they're trying to access
            Optional<UserBook> userBook = userBookService.getUserBooks(user.getId()).stream()
                    .filter(ub -> ub.getBook().getCoverImagePath().endsWith(filename))
                    .findFirst();

            if (userBook.isEmpty()){
                return ResponseEntity.status(HttpStatus.FORBIDDEN).build(); //not authorized
            }

            Path filePath = Path.of(uploadDir, "covers", filename);
            Resource resource = new FileSystemResource(filePath);

            if(!resource.exists()){
                return ResponseEntity.notFound().build(); //file not found
            }

            return ResponseEntity.ok()
                    .contentType(org.springframework.http.MediaType.IMAGE_JPEG)
                    .body(resource);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }
}
