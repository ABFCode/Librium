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

@Configuration
public class UploadStorageConfig {
    private static final Logger logger = LoggerFactory.getLogger(UploadStorageConfig.class);

    @Value("${books.upload.dir:${user.dir}/uploads}")
    private String uploadDir;

    @PostConstruct
    public void init() {
        Path directory = Path.of(uploadDir);
        try {
            //Create directory if it doesn't exist
            if (!Files.exists(directory)) {
                logger.info("Creating upload directory: {}", uploadDir);
                Files.createDirectories(directory);
                return;// No need to clean if we just created it
            }

            //Empty existing directory
            logger.info("Emptying upload directory: {}", uploadDir);
            try (var files = Files.list(directory)) {
                files.forEach(file -> {
                    try {
                        Files.delete(file);
                        logger.debug("Deleted file: {}", file.getFileName());
                    } catch (IOException e) {
                        logger.error("Failed to delete file: {}", file.getFileName(), e);
                    }
                });
            }
        } catch (IOException e) {
            throw new RuntimeException("Could not initialize upload directory", e);
        }
    }

    @Bean
    public String uploadDir() {
        return uploadDir;
    }
}