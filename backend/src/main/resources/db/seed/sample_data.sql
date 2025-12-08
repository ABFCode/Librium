INSERT INTO book_ratings (user_id, book_id, rating, created_at)
VALUES 
    (1, 1, 5, NOW()),
    (1, 2, 4, NOW());

INSERT INTO book_favorites (user_id, book_id, created_at)
VALUES (1, 1, NOW());

INSERT INTO book_notes (user_id, book_id, note_text, created_at, updated_at)
VALUES 
    (1, 1, 'Great book!', NOW(), NOW()),
    (1, 2, 'Timeless story.', NOW(), NOW());

