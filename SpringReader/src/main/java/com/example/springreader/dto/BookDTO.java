package com.example.springreader.dto;

import com.example.springreader.model.Book;
import com.example.springreader.model.UserBook;
import lombok.Data;

/**
 * DTO representing book data for display in the user's library, including user-specific progress.
 */
@Data
public class BookDTO {
    private Long id;
    private String title;
    private String author;
    //The index of the last chapter read by the user.
    private int lastChapterIndex;
    //Indicates if a cover image exists for this book.
    private boolean hasCoverImage = false;


    /**
     * Creates a BookDTO from a UserBook entity, mapping book details
     * and the user's last read chapter index.
     *
     * @param userBook The UserBook entity containing book and progress info.
     * @return A new BookDTO instance.
     */
    public static BookDTO fromUserBook(UserBook userBook){
        BookDTO bookDTO = new BookDTO();
        Book book = userBook.getBook();
        bookDTO.setId(book.getId());
        bookDTO.setTitle(book.getTitle());
        bookDTO.setAuthor(book.getAuthor());
        bookDTO.setLastChapterIndex(userBook.getLastChapterIndex());
        bookDTO.setHasCoverImage(book.getCoverImagePath() != null);
        return bookDTO;
    }
}