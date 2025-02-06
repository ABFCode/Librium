package com.example.springreader.controller;

import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/hello")
@CrossOrigin(origins = "http://localhost:5173")
public class HelloController {

    @GetMapping
    public String hello(){
        return "Hello from Java";
    }

}
