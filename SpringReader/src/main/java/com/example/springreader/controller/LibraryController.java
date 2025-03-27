package com.example.springreader.controller;

import com.example.springreader.dto.BookDTO;
import com.example.springreader.model.Book;
import com.example.springreader.model.User;
import com.example.springreader.model.UserBook;
import com.example.springreader.service.LibraryService;
import com.example.springreader.service.UserBookService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Controller class for managing books in a library.
 * allows for uploading and  retrieving a list of books.
 */
@Slf4j
@RestController
@RequestMapping("/api/library")
public class LibraryController {
    private final LibraryService libraryService;
    private final String uploadDir;
    private final UserBookService userBookService;

    public LibraryController(LibraryService libraryService, String uploadDir, UserBookService userBookService){
        this.libraryService = libraryService;
        this.uploadDir = uploadDir;
        this.userBookService = userBookService;
    }

    /**
     * Handles the upload of a book file and adds it to the library.
     *
     * Creates a random filename for the book we're uploading. This is to prepare for multiple users.
     * Copies the file we uploaded to the filepath we just made, replacing any books with the same name, though no books should
     *
     * Sends book to our library service which will add it to our DB, need to change newer Path to old File since I haven't
     * finished refactoring rest of project to use Path.
     *
     * @param file the MultipartFile containing the book to be uploaded
     * @return the Book object created and stored in the library
     * @throws IOException if an error occurs during file processing
     */
    @PostMapping("/upload")
    public Book uploadBook(@RequestParam("file") MultipartFile file, @AuthenticationPrincipal User user) throws IOException {

        String originalFileName = file.getOriginalFilename();
        if(originalFileName == null || !originalFileName.toLowerCase().endsWith(".epub")){
            throw new IllegalArgumentException("Only epub files are supported");
        }

        String contentType = file.getContentType();
        if (contentType == null || !contentType.equals("application/epub+zip")){
            throw new IllegalArgumentException("Only epub files are supported");
        }




        String filename = UUID.randomUUID() + "-" + (originalFileName);

        //each user should get their own dir or some other sol.
        Path filepath = Path.of(uploadDir, filename);


        Files.copy(file.getInputStream(), filepath, StandardCopyOption.REPLACE_EXISTING);

        //Maybe change libraryService to use Path
        Book book = libraryService.addBook(filepath.toFile());

        userBookService.createUserBook(user, book);

        return book;


    }

    @GetMapping()
    public ResponseEntity<List<BookDTO>> getUserBooks(@AuthenticationPrincipal User user){
        List<UserBook> userBooks = userBookService.getUserBooks(user.getId());
        List<BookDTO> bookDTOS = userBooks.stream()
                .map(userBook -> BookDTO.fromUserBook(userBook))
                .collect(Collectors.toList());
        return ResponseEntity.ok(bookDTOS);
    }


    /**
     * Retrieves a list of all books stored in the library.
     *
     * @return a list of Book objects representing all books in the db
     */
//    @GetMapping
//    public List<Book> listBooks(){
//        return libraryService.ListAll();
//    }
}
