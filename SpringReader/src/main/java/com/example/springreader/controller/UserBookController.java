package com.example.springreader.controller;

import com.example.springreader.dto.UserBookProgressDTO;
import com.example.springreader.model.User;
import com.example.springreader.model.UserBook;
import com.example.springreader.service.UserBookService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/progress")
@RequiredArgsConstructor
public class UserBookController {
    private final UserBookService userBookService;


    @PostMapping("/save")
    public ResponseEntity<UserBook> saveBookProgress(@RequestBody UserBookProgressDTO progressDTO, @AuthenticationPrincipal User user) {
        return ResponseEntity.ok(userBookService.saveBookProgress(progressDTO, user));
    }

    @GetMapping("/get")
    public ResponseEntity<Integer> getBookProgress(@RequestParam Long bookId, @AuthenticationPrincipal User user) {
        return ResponseEntity.ok(userBookService.getBookProgress(bookId, user));
    }
}
