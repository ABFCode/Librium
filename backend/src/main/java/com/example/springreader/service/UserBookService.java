package com.example.springreader.service;


import com.example.springreader.dto.UserBookProgressDTO;
import com.example.springreader.exception.ResourceNotFoundException;
import com.example.springreader.model.Book;
import com.example.springreader.model.User;
import com.example.springreader.model.UserBook;
import com.example.springreader.repository.UserBookRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * Service layer for managing the relationship between users and books (UserBook).
 * Handles creating associations, saving reading progress, and retrieving user-specific library information.
 */
@Service
@RequiredArgsConstructor
public class UserBookService {
    private final UserBookRepository userBookRepository;


    /**
     * Creates and saves a new association between a given user and book.
     * Initializes the reading progress (lastChapterIndex) to 0 by default.
     *
     * @param user The User entity to associate.
     * @param book The Book entity to associate.
     */
    @Transactional
    public void createUserBook(User user, Book book) {
        UserBook userBook = new UserBook();
        userBook.setUser(user);
        userBook.setBook(book);
        userBookRepository.save(userBook);
    }

    /**
     * Updates the reading progress (last read chapter index) for a specific user and book.
     *
     * @param progressDTO DTO containing the bookId and the new lastChapterIndex.
     * @param user The currently authenticated User making the update.
     * @throws ResourceNotFoundException if no UserBook association exists for the given user and bookId.
     */
//    @Transactional
//    public void saveBookProgress(UserBookProgressDTO progressDTO, User user) {
//        UserBook userBook = userBookRepository.findByUserIdAndBookId(user.getId(), progressDTO.bookId())
//                .orElseThrow(() -> new ResourceNotFoundException("UserBook not found for user: " + user.getId() + " and book: " + progressDTO.bookId()));
//        userBook.setLastChapterIndex(progressDTO.lastChapterIndex());
//        userBookRepository.save(userBook);
//    }

    @Transactional
    public void saveBookProgress(UserBookProgressDTO progressDTO, User user) {
        try {
            userBookRepository.updateReadingProgress(
                    user.getId(),
                    progressDTO.bookId(),
                    progressDTO.lastChapterIndex()
            );
        } catch (Exception e) {
            throw new ResourceNotFoundException(
                    "Failed to update reading progress: " + e.getMessage()
            );
        }
    }


    /**
     * Retrieves all UserBook associations for a specific user.
     * This effectively gets the user's library.
     *
     * @param userId The ID of the user whose books are to be retrieved.
     * @return A List of UserBook entities associated with the user.
     */
    @Transactional(readOnly = true)
    public List<UserBook> getUserBooks(Long userId) {
        return userBookRepository.findByUserId(userId);
    }

    /**
     * Retrieves the last known reading progress (chapter index) for a specific book and user.
     *
     * @param bookId The ID of the book to get progress for.
     * @param user The currently authenticated User.
     * @return The last saved chapter index, or 0 if no progress has been saved for this user/book combination.
     */
    @Transactional(readOnly = true)
    public Integer getBookProgress(Long bookId, User user) {
        return userBookRepository.findByUserIdAndBookId(user.getId(), bookId)
                .map(userBook -> userBook.getLastChapterIndex())
                .orElse(0);
    }
}
