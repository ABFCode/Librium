package com.example.springreader.service;

import com.example.springreader.model.Book;
import com.example.springreader.model.DefaultBook;
import com.example.springreader.repository.BookRepository;
import com.example.springreader.repository.DefaultBookRepository;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Service responsible for initializing the application with a default book
 * upon startup if one doesn't already exist in the database.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class BookInitService {
    private final BookRepository bookRepository;
    private final DefaultBookRepository defaultBookRepository;
    private final ResourceLoader resourceLoader;
    private final Path uploadDir;
    private final LibraryService libraryService;

    /**
     * The classpath location of the default book file. Injected from application properties.
     */
    @Value("${default.book.path}")
    private String defaultBookPath;


    /**
     * Checks for and initializes a default book after the service is constructed.
     * If no book is marked as default in the database, it copies the book specified by
     * defaultBookPath from resources to the upload directory, adds it
     * via the LibraryService, marks it as default, and saves it.
     * Logs informational messages or errors encountered during the process.
     */
    @PostConstruct
    @Transactional
    public void initializeDefaultBook(){
        List<DefaultBook> existingDefaultBooks = defaultBookRepository.findAll();

        if(!existingDefaultBooks.isEmpty()){
            DefaultBook existingDefault = existingDefaultBooks.get(0);
            log.info("Default book already exists in DB with title: {} and ID: {}",
                    existingDefault.getBook().getTitle(), existingDefault.getBook().getId());
            return;
        }

        try {
            Resource resource = resourceLoader.getResource(defaultBookPath);
            if(!resource.exists()){
                log.error("Default book file not found at path: {}", defaultBookPath);
                return;
            }

            String fileName = "default-" + UUID.randomUUID() + ".epub";
            Path targetPath = uploadDir.resolve(fileName);

            try(InputStream inputStream = resource.getInputStream()){
                Files.copy(inputStream, targetPath, StandardCopyOption.REPLACE_EXISTING);
                log.info("Default book file copied to: {}", targetPath);
            }

            File bookFile = targetPath.toFile();
            Book book = libraryService.addBook(bookFile);

            DefaultBook defaultBook = new DefaultBook(book);
            defaultBookRepository.save(defaultBook);

            log.info("Default book with title: {} and ID: {} added to DB", book.getTitle(), book.getId());

        } catch (IOException e) {
            log.error("IOException while initializing default book", e);
        } catch (Exception e){
            log.error("General exception while initializing default book", e);
        }
    }
}