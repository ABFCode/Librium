package com.example.springreader.config;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Configuration class for managing the upload storage directory.
 *
 * This class initializes and configures the directory for file uploads during startup.
 * IT will clear the directory if it already exists
 */
@Configuration
public class UploadStorageConfig {
    private static final Logger logger = LoggerFactory.getLogger(UploadStorageConfig.class);

    @Value("${books.upload.dir:${user.dir}/uploads}")
    private String uploadDir;

    /**
     * Initializes the directory for file uploads during startup.
     *
     * This method ensures the upload directory exists, and if it already exists,
     * clears all files within the directory. It is run automatically after our UploadStorageConfig
     * class is fully setup and all dependencies injected (uploadDir) in this case.
     *
     */
    @PostConstruct
    public void init() {
        Path directory = Path.of(uploadDir);
        try {
            //Create directory if it doesn't exist
            if (!Files.exists(directory)) {
                logger.info("Creating upload directory: {}", uploadDir);
                Files.createDirectories(directory);
                return;
            }

//            //Empty existing directory
//            logger.info("Emptying upload directory: {}", uploadDir);
//            try (var files = Files.list(directory)) {
//                files.forEach(file -> {
//                    try {
//                        Files.delete(file);
//                        logger.debug("Deleted file: {}", file.getFileName());
//                    } catch (IOException e) {
//                        logger.error("Failed to delete file: {}", file.getFileName(), e);
//                    }
//                });
//            }
        } catch (IOException e) {
            throw new RuntimeException("Could not initialize upload directory", e);
        }
    }

    /**
     * Provides the uploadDir to the spring app context, to be used wherever.
     *
     * @return the path of the upload dir as a string
     */
    @Bean
    public String uploadDir() {
        return uploadDir;
    }
}