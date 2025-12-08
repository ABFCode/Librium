INSERT INTO authors (name) 
SELECT name FROM (VALUES 
    ('Jane Austen'),
    ('Mark Twain'),
    ('Charles Dickens'),
    ('J.R.R. Tolkien'),
    ('George Orwell'),
    ('Ernest Hemingway'),
    ('Virginia Woolf'),
    ('F. Scott Fitzgerald')
) AS v(name)
WHERE NOT EXISTS (SELECT 1 FROM authors WHERE authors.name = v.name);

UPDATE books SET author_id = (SELECT id FROM authors WHERE name = 'Lewis Carroll' LIMIT 1) 
WHERE id = 1 AND author_id IS NULL;

UPDATE books SET author_id = (SELECT id FROM authors WHERE name = 'Jane Austen' LIMIT 1) 
WHERE id = 2 AND author_id IS NULL;

UPDATE chapters SET word_count = 5000 WHERE book_id = 1 AND chapter_index = 0;
UPDATE chapters SET word_count = 3500 WHERE book_id = 1 AND chapter_index = 1;
UPDATE chapters SET word_count = 4200 WHERE book_id = 1 AND chapter_index = 2;
UPDATE chapters SET word_count = 3800 WHERE book_id = 1 AND chapter_index = 3;
UPDATE chapters SET word_count = 4500 WHERE book_id = 1 AND chapter_index = 4;
UPDATE chapters SET word_count = 4000 WHERE book_id = 1 AND chapter_index = 5;
UPDATE chapters SET word_count = 4300 WHERE book_id = 1 AND chapter_index = 6;
UPDATE chapters SET word_count = 3900 WHERE book_id = 1 AND chapter_index = 7;
UPDATE chapters SET word_count = 4100 WHERE book_id = 1 AND chapter_index = 8;
UPDATE chapters SET word_count = 4400 WHERE book_id = 1 AND chapter_index = 9;

UPDATE chapters SET word_count = 6000 WHERE book_id = 2 AND chapter_index = 0;
UPDATE chapters SET word_count = 4800 WHERE book_id = 2 AND chapter_index = 1;
UPDATE chapters SET word_count = 5200 WHERE book_id = 2 AND chapter_index = 2;
UPDATE chapters SET word_count = 5500 WHERE book_id = 2 AND chapter_index = 3;
UPDATE chapters SET word_count = 4900 WHERE book_id = 2 AND chapter_index = 4;
UPDATE chapters SET word_count = 5100 WHERE book_id = 2 AND chapter_index = 5;
UPDATE chapters SET word_count = 5300 WHERE book_id = 2 AND chapter_index = 6;
UPDATE chapters SET word_count = 4700 WHERE book_id = 2 AND chapter_index = 7;
UPDATE chapters SET word_count = 5400 WHERE book_id = 2 AND chapter_index = 8;
UPDATE chapters SET word_count = 5000 WHERE book_id = 2 AND chapter_index = 9;

UPDATE chapters SET word_count = 4000 WHERE word_count = 0;

UPDATE user_books SET 
    last_chapter_index = 5,
    last_accessed = NOW() - INTERVAL '30 minutes'
WHERE user_id = 1 AND book_id = 1;

UPDATE user_books SET 
    last_chapter_index = 4,
    last_accessed = NOW() - INTERVAL '2 hours'
WHERE user_id = 1 AND book_id = 2;

INSERT INTO book_ratings (user_id, book_id, rating, created_at) VALUES 
    (1, 1, 5, NOW() - INTERVAL '20 days')
ON CONFLICT (user_id, book_id) DO UPDATE SET rating = EXCLUDED.rating;

INSERT INTO book_ratings (user_id, book_id, rating, created_at) VALUES 
    (1, 2, 4, NOW() - INTERVAL '18 days')
ON CONFLICT (user_id, book_id) DO UPDATE SET rating = EXCLUDED.rating;

INSERT INTO book_favorites (user_id, book_id, created_at) VALUES 
    (1, 1, NOW() - INTERVAL '14 days')
ON CONFLICT (user_id, book_id) DO NOTHING;

INSERT INTO book_favorites (user_id, book_id, created_at) VALUES 
    (1, 2, NOW() - INTERVAL '7 days')
ON CONFLICT (user_id, book_id) DO NOTHING;

INSERT INTO book_notes (user_id, book_id, note_text, created_at, updated_at) VALUES 
    (1, 1, 'Great book! Really enjoyed the characters and plot. The world-building is exceptional.', NOW() - INTERVAL '24 days', NOW() - INTERVAL '24 days'),
    (1, 2, 'Classic children''s literature. Timeless story that never gets old.', NOW() - INTERVAL '21 days', NOW() - INTERVAL '21 days'),
    (1, 1, 'Second reading - even better the second time around!', NOW() - INTERVAL '18 days', NOW() - INTERVAL '17 days'),
    (1, 2, 'Perfect for bedtime reading. The prose is beautiful.', NOW() - INTERVAL '15 days', NOW() - INTERVAL '15 days'),
    (1, 1, 'Noticed so many details I missed the first time. Highly recommend multiple reads.', NOW() - INTERVAL '12 days', NOW() - INTERVAL '11 days'),
    (1, 2, 'The character development is outstanding. Each chapter builds beautifully.', NOW() - INTERVAL '9 days', NOW() - INTERVAL '9 days'),
    (1, 1, 'Third time reading this and still finding new layers. Masterpiece.', NOW() - INTERVAL '6 days', NOW() - INTERVAL '5 days'),
    (1, 2, 'The dialogue is witty and engaging. Characters feel so real.', NOW() - INTERVAL '4 days', NOW() - INTERVAL '4 days'),
    (1, 1, 'The pacing is perfect. Could not put it down.', NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day'),
    (1, 2, 'Beautiful imagery throughout. Really transports you to another world.', NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day'),
    (1, 1, 'The themes are timeless and relevant even today.', NOW() - INTERVAL '12 hours', NOW() - INTERVAL '12 hours'),
    (1, 2, 'Love how the story unfolds. Each chapter reveals something new.', NOW() - INTERVAL '6 hours', NOW() - INTERVAL '6 hours');
