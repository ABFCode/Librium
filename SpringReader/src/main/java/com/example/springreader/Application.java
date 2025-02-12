package com.example.springreader;


import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

import java.io.File;

@SpringBootApplication
public class Application {


    public static void main(String[] args) {
        File epubFile = new File("src/main/resources/files/pg11.epub");
        SpringApplication.run(Application.class, args);
        //EpubParser.parseEpub();
        //EpubParser.parseMeta(epubFile);
        //EpubParser.parseContent(epubFile, 1);
    }

}
