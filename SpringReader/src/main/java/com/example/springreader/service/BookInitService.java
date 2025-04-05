package com.example.springreader.service;

import com.example.springreader.model.Book;
import com.example.springreader.repository.BookRepository;
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
import java.util.Optional;
import java.util.UUID;

/**
 * Service responsible for initializing the app with some default books.
 * Only populates if DB is empty on startup.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class BookInitService {
    private final BookRepository bookRepository;
    private final ResourceLoader resourceLoader;
    private final String uploadDir;
    private final LibraryService libraryService;


    @Value("${default.book.path}")
    private String defaultBookPath;



    @PostConstruct
    @Transactional
    public void initializeDefaultBook(){
        Optional<Book> existingDefaultBook = bookRepository.findByisDefaultTrue();

        if(existingDefaultBook.isEmpty()){
            try {
                Resource resource = resourceLoader.getResource(defaultBookPath);
                if(!resource.exists()){
                    log.error("Default book file not found at path: {}", defaultBookPath);
                    return;
                }

                String fileName = "default-" + UUID.randomUUID() + ".epub";
                Path targetPath = Path.of(uploadDir, fileName);

                try(InputStream inputStream = resource.getInputStream()){
                    Files.copy(inputStream, targetPath, StandardCopyOption.REPLACE_EXISTING);
                    log.info("Default book file copied to: {}", targetPath);
                }

                File bookFile = targetPath.toFile();
                Book book = libraryService.addBook(bookFile);
                book.setDefault(true);
                bookRepository.save(book);

                log.info("Is bookdefault : {}", book.isDefault());

                log.info("Default book with title: {} and ID: {} added to DB", book.getTitle(), book.getId());



            } catch (IOException e) {
                log.error("IOException while initializing default book", e);
            }
            catch (Exception e){
                log.error("Exception while initializing default book", e);
            }
        }
        else{
            log.info("Default book already exists in DB with title: {} and ID: {}", existingDefaultBook.get().getTitle(), existingDefaultBook.get().getId());
        }

    }


}
