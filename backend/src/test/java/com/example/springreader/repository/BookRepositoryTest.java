package com.example.springreader.repository;


import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;



//Auto configures an in-memory database using JPA through hibernate, auotmatically includes all of our @Entity classes (book/user atm)
//Rolls back any transactions after each test
@DataJpaTest
class BookRepositoryTest {

    @Autowired
    private BookRepository bookRepository;

    /**
     * Tests that a book can be saved and retrieved.
     */
//    @Test
//    void saveAndFindById_savesAndRetrievesBook() {
//        Book book = new Book("Title", "Author", "path/file.epub", "path/file.png");
//        Book savedBook = bookRepository.save(book);
//
//        Optional<Book> retrievedBook = bookRepository.findById(savedBook.getId());
//
//        assertTrue(retrievedBook.isPresent(), "Book should be found");
//        assertEquals("Title", retrievedBook.get().getTitle(), "Title should match");
//        assertEquals("Author", retrievedBook.get().getAuthor(), "Author should match");
//        assertEquals("path/file.epub", retrievedBook.get().getFilePath(), "File path should match");
//    }
//
//    /**
//     * Tests that a book can be deleted from the repository.
//     */
//    @Test
//    void deleteById_deletesBook() {
//        Book book = new Book("Test Title", "Test Author", "path/file.epub", "path/file.png");
//        Book savedBook = bookRepository.save(book);
//
//        bookRepository.deleteById(savedBook.getId());
//
//        Optional<Book> retrievedBook = bookRepository.findById(savedBook.getId());
//        assertFalse(retrievedBook.isPresent(), "Book should no longer exist");
//    }
}
