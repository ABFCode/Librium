package com.example.springreader.controller;

import com.example.springreader.utility.EpubParser;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/epub")
@CrossOrigin(origins = "http://localhost:5173")
public class EpubController {

    @GetMapping
    public String getEpub(){
        return EpubParser.parseEpub();
    }
}
