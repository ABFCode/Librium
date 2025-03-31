package com.example.springreader.service;


import com.example.springreader.dto.UserBookProgressDTO;
import com.example.springreader.exception.ResourceNotFoundException;
import com.example.springreader.model.Book;
import com.example.springreader.model.User;
import com.example.springreader.model.UserBook;
import com.example.springreader.repository.BookRepository;
import com.example.springreader.repository.UserBookRepository;
import com.example.springreader.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
public class UserBookService {
    private final UserBookRepository userBookRepository;
    private final UserRepository userRepository;
    private final BookRepository bookRepository;


    public void createUserBook(User user, Book book) {
        UserBook userBook = new UserBook();
        userBook.setUser(user);
        userBook.setBook(book);
        userBookRepository.save(userBook);
    }

    public void saveBookProgress(UserBookProgressDTO progressDTO, User user) {
        UserBook userBook = userBookRepository.findByUserIdAndBookId(user.getId(), progressDTO.bookId())
                .orElseThrow(() -> new ResourceNotFoundException("UserBook not found for user: " + user.getId() + " and book: " + progressDTO.bookId()));
        userBook.setLastChapterIndex(progressDTO.lastChapterIndex());
        userBookRepository.save(userBook);
    }


    public List<UserBook> getUserBooks(Long userId) {
        return userBookRepository.findByUserId(userId);
    }

    public Integer getBookProgress(Long bookId, User user) {
        return userBookRepository.findByUserIdAndBookId(user.getId(), bookId)
                .map(userBook -> userBook.getLastChapterIndex())
                .orElse(0);
    }
}
