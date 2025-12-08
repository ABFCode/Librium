ALTER TABLE authors DROP CONSTRAINT IF EXISTS authors_name_key;

ALTER TABLE chapters DROP CONSTRAINT IF EXISTS fk_chapters_book;
ALTER TABLE chapters ADD CONSTRAINT fk_chapters_book 
    FOREIGN KEY (book_id) REFERENCES books(id) 
    ON DELETE CASCADE ON UPDATE RESTRICT;

ALTER TABLE user_books DROP CONSTRAINT IF EXISTS fk_user_books_user;
ALTER TABLE user_books ADD CONSTRAINT fk_user_books_user 
    FOREIGN KEY (user_id) REFERENCES users(id) 
    ON DELETE CASCADE ON UPDATE RESTRICT;

ALTER TABLE user_books DROP CONSTRAINT IF EXISTS fk_user_books_book;
ALTER TABLE user_books ADD CONSTRAINT fk_user_books_book 
    FOREIGN KEY (book_id) REFERENCES books(id) 
    ON DELETE CASCADE ON UPDATE RESTRICT;

ALTER TABLE books DROP CONSTRAINT IF EXISTS fk_books_author;
ALTER TABLE books ADD CONSTRAINT fk_books_author 
    FOREIGN KEY (author_id) REFERENCES authors(id) 
    ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE book_files DROP CONSTRAINT IF EXISTS fk_book_files_book;
ALTER TABLE book_files ADD CONSTRAINT fk_book_files_book 
    FOREIGN KEY (book_id) REFERENCES books(id) 
    ON DELETE CASCADE ON UPDATE RESTRICT;

ALTER TABLE book_images DROP CONSTRAINT IF EXISTS fk_book_images_book;
ALTER TABLE book_images ADD CONSTRAINT fk_book_images_book 
    FOREIGN KEY (book_id) REFERENCES books(id) 
    ON DELETE CASCADE ON UPDATE RESTRICT;

ALTER TABLE default_books DROP CONSTRAINT IF EXISTS fk_default_books_book;
ALTER TABLE default_books ADD CONSTRAINT fk_default_books_book 
    FOREIGN KEY (book_id) REFERENCES books(id) 
    ON DELETE CASCADE ON UPDATE RESTRICT;

ALTER TABLE chapters ADD CONSTRAINT chk_chapters_word_count CHECK (word_count >= 0);
ALTER TABLE chapters ADD CONSTRAINT chk_chapters_index CHECK (chapter_index >= 0);
ALTER TABLE user_books ADD CONSTRAINT chk_user_books_chapter_index CHECK (last_chapter_index >= 0);
ALTER TABLE book_files ADD CONSTRAINT chk_book_files_size CHECK (file_size > 0);
ALTER TABLE book_images ADD CONSTRAINT chk_book_images_size CHECK (file_size > 0);
ALTER TABLE book_images ADD CONSTRAINT chk_book_images_width CHECK (width IS NULL OR width > 0);
ALTER TABLE book_images ADD CONSTRAINT chk_book_images_height CHECK (height IS NULL OR height > 0);

ALTER TABLE user_books ADD CONSTRAINT uk_user_books_user_book UNIQUE (user_id, book_id);

CREATE INDEX idx_user_books_user ON user_books(user_id);
CREATE INDEX idx_user_books_user_book ON user_books(user_id, book_id);