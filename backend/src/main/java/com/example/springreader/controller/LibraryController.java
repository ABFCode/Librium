package com.example.springreader.controller;

import com.example.springreader.dto.BookDTO;
import com.example.springreader.model.Book;
import com.example.springreader.model.User;
import com.example.springreader.model.UserBook;
import com.example.springreader.service.LibraryService;
import com.example.springreader.service.UserBookService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Controller class for managing books in a library.
 * Handles uploading, downloading, listing, and deleting books for authenticated users.
 */
@Slf4j
@RestController
@RequestMapping("/api/library")
public class LibraryController {
    private final LibraryService libraryService;
    private final Path uploadDir;
    private final UserBookService userBookService;

    /**
     * Constructor for injecting dependencies.
     * @param libraryService The service for library operations.
     * @param uploadDir The directory for uploads.
     * @param userBookService The service for userBook operations
     */
    public LibraryController(LibraryService libraryService, Path uploadDir, UserBookService userBookService){
        this.libraryService = libraryService;
        this.uploadDir = uploadDir;
        this.userBookService = userBookService;
    }

    /**
     * Handles the upload of an epub file and associates it with the logged-in user.
     *
     * Validates the file (must be .epub).
     * Creates a unique filename to avoid conflicts.
     * Saves the file to the upload directory.
     * Adds the book metadata to the database via LibraryService.
     * Creates an association between the user and the new book via UserBookService.
     *
     * @param file The epub file uploaded by the user.
     * @param user The currently authenticated user.
     * @return ResponseEntity indicating success (201 CREATED) or failure.
     * @throws IOException If there's an error saving the file.
     * @throws IllegalArgumentException If the file is not a valid epub.
     */
    @PostMapping("/upload")
    public ResponseEntity<Void> uploadBook(@RequestParam("file") MultipartFile file, @AuthenticationPrincipal User user) throws IOException {

        String originalFileName = file.getOriginalFilename();
        //Basic validation: check extension
        if(originalFileName == null || !originalFileName.toLowerCase().endsWith(".epub")){
            throw new IllegalArgumentException("Invalid filename. Only epub files are supported");
        }

        String contentType = file.getContentType();
        //Basic validation: check content type
        if (contentType == null || !contentType.equals("application/epub+zip")){
            log.warn("Content type {} for file {}, expected application/epub+zip.", contentType, originalFileName);
            throw new IllegalArgumentException("Invalid file content type. Only epub files are supported");
        }

        String filename = UUID.randomUUID() + "-" + originalFileName;

        Path filepath = uploadDir.resolve(filename);

        Files.copy(file.getInputStream(), filepath, StandardCopyOption.REPLACE_EXISTING);


        Book book = libraryService.addBook(filepath.toFile());


        userBookService.createUserBook(user, book);

        return ResponseEntity.status(HttpStatus.CREATED).build();
    }

    /**
     * Allows a logged-in user to download a book file they have access to.
     *
     * @param bookId The ID of the book to download.
     * @param user The currently authenticated user.
     * @return ResponseEntity containing the book file as a Resource or an error status.
     * @throws IOException If there's an error reading the book file.
     */
    @GetMapping("/download/{bookId}")
    public ResponseEntity<Resource> downloadBook(@PathVariable Long bookId, @AuthenticationPrincipal User user) throws IOException {
        //Fetch book data and filename, ensuring user has access
        Map<String, Object> bookInfo = libraryService.getBookResources(bookId, user.getId());
        String filename = (String) bookInfo.get("filename");
        Resource bookData = (Resource) bookInfo.get("bookData");

        //Build the response with correct headers for file download
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("application/epub+zip")) //Standard epub MIME type
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"") //Tell browser to download
                .body(bookData);
    }

    /**
     * Retrieves the list of books associated with the currently logged-in user.
     *
     * @param user The currently authenticated user.
     * @return ResponseEntity containing a list of BookDTOs for the user's library.
     */
    @GetMapping()
    public ResponseEntity<List<BookDTO>> getUserBooks(@AuthenticationPrincipal User user){
        List<BookDTO> bookDTOS = libraryService.getUserBooksWithCoverInfo(user.getId());
        return ResponseEntity.ok(bookDTOS);
    }


    /**
     * Deletes a book association for the logged-in user and potentially the book file itself.
     * The LibraryService handles the logic of whether to delete the file or not.
     *
     * @param bookId The ID of the book to delete.
     * @param user The currently authenticated user.
     * @return ResponseEntity indicating success (200 OK) or failure.
     */
    @DeleteMapping("/delete/{bookId}")
    public ResponseEntity<Void> deleteBook(@PathVariable Long bookId, @AuthenticationPrincipal User user){
        libraryService.deleteBook(bookId, user.getId());
        return ResponseEntity.ok().build();
    }

}