package com.example.springreader.dto;

import com.example.springreader.model.Book;
import com.example.springreader.model.UserBook;
import lombok.Data;

@Data
public class BookDTO {
    private Long id;
    private String title;
    private String author;
    private int lastChapterIndex;


    public static BookDTO fromUserBook(UserBook userBook){
        BookDTO bookDTO = new BookDTO();
        Book book = userBook.getBook();
        bookDTO.setId(book.getId());
        bookDTO.setTitle(book.getTitle());
        bookDTO.setAuthor(book.getAuthor());
        bookDTO.setLastChapterIndex(userBook.getLastChapterIndex());
        return bookDTO;
    }
}
