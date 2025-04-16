package com.example.springreader.controller;

import com.example.springreader.dto.BookDTO;
import com.example.springreader.model.Book;
import com.example.springreader.model.User;
import com.example.springreader.model.UserBook;
import com.example.springreader.service.LibraryService;
import com.example.springreader.service.UserBookService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
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
    public ResponseEntity<Void> uploadBook(@RequestParam("file") MultipartFile file, @AuthenticationPrincipal User user) throws IOException {

        String originalFileName = file.getOriginalFilename();
        if(originalFileName == null || !originalFileName.toLowerCase().endsWith(".epub")){
            throw new IllegalArgumentException("Invalid filename. Only epub files are supported");
        }

        String contentType = file.getContentType();
        if (contentType == null || !contentType.equals("application/epub+zip")){
            log.warn("Content type {} for file {}, this is not supposed to happen. Fix this!", contentType, originalFileName);
            throw new IllegalArgumentException("Invalid file content type. Only epub files are supported");
        }




        String filename = UUID.randomUUID() + "-" + originalFileName;

        //each user should get their own dir or some other sol.
        Path filepath = Path.of(uploadDir, filename);


        Files.copy(file.getInputStream(), filepath, StandardCopyOption.REPLACE_EXISTING);

        //Maybe change libraryService to use Path
        Book book = libraryService.addBook(filepath.toFile());

        userBookService.createUserBook(user, book);

        return ResponseEntity.status(HttpStatus.CREATED).build();


    }

    @GetMapping()
    public ResponseEntity<Resource> downloadBook(@PathVariable Long bookId, @AuthenticationPrincipal User user) throws IOException {

        Map<String, Object> bookInfo = libraryService.getBookResources(bookId, user.getId());
        String filename = (String) bookInfo.get("filename");
        Resource bookData = (Resource) bookInfo.get("bookData");


        return null;
    }

    @GetMapping()
    public ResponseEntity<List<BookDTO>> getUserBooks(@AuthenticationPrincipal User user){
        List<UserBook> userBooks = userBookService.getUserBooks(user.getId());
        List<BookDTO> bookDTOS = userBooks.stream()
                .map(userBook -> BookDTO.fromUserBook(userBook))
                .collect(Collectors.toList());
        return ResponseEntity.ok(bookDTOS);
    }


    @DeleteMapping("/delete/{bookId}")
    public ResponseEntity<Void> deleteBook(@PathVariable Long bookId, @AuthenticationPrincipal User user){
        libraryService.deleteBook(bookId, user.getId());
        return ResponseEntity.ok().build();
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
