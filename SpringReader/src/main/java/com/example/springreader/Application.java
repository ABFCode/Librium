package com.example.springreader;


import com.example.springreader.utility.EpubParser;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class Application {

    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
        EpubParser.parseEpub();
    }

}
