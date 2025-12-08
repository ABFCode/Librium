CREATE OR REPLACE PROCEDURE update_reading_progress(
    p_user_id BIGINT,
    p_book_id BIGINT,
    p_chapter_index INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_max_chapters INTEGER;
    v_exists BOOLEAN;
BEGIN
    SELECT EXISTS(
        SELECT 1 FROM user_books 
        WHERE user_id = p_user_id AND book_id = p_book_id
    ) INTO v_exists;
    
    IF NOT v_exists THEN
        RAISE EXCEPTION 'UserBook not found for user_id: % and book_id: %', p_user_id, p_book_id;
    END IF;
    
    SELECT COALESCE(MAX(chapter_index), 0) INTO v_max_chapters
    FROM chapters
    WHERE book_id = p_book_id;
    
    IF p_chapter_index < 0 THEN
        RAISE EXCEPTION 'Chapter index cannot be negative: %', p_chapter_index;
    END IF;
    
    IF p_chapter_index > v_max_chapters THEN
        RAISE EXCEPTION 'Chapter index % exceeds maximum chapters % for book_id: %', 
            p_chapter_index, v_max_chapters, p_book_id;
    END IF;
    
    UPDATE user_books
    SET 
        last_chapter_index = p_chapter_index,
        last_accessed = NOW()
    WHERE 
        user_id = p_user_id 
        AND book_id = p_book_id;
END;
$$;

CREATE OR REPLACE FUNCTION get_book_word_count(p_book_id BIGINT)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_total_words INTEGER;
BEGIN
    SELECT COALESCE(SUM(word_count), 0) INTO v_total_words
    FROM chapters
    WHERE book_id = p_book_id;
    
    RETURN v_total_words;
END;
$$;

CREATE OR REPLACE FUNCTION update_last_accessed()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.last_accessed = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_update_last_accessed
    BEFORE UPDATE OF last_chapter_index ON user_books
    FOR EACH ROW
    WHEN (OLD.last_chapter_index IS DISTINCT FROM NEW.last_chapter_index)
    EXECUTE FUNCTION update_last_accessed();

CREATE OR REPLACE FUNCTION get_authors_with_book_counts()
RETURNS TABLE (
    author_id BIGINT,
    author_name VARCHAR,
    book_count INTEGER
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        a.id AS author_id,
        a.name AS author_name,
        COUNT(b.id)::INTEGER AS book_count
    FROM authors a
    LEFT JOIN books b ON b.author_id = a.id
    GROUP BY a.id, a.name
    ORDER BY book_count DESC, a.name ASC;
END;
$$;

CREATE OR REPLACE FUNCTION get_recently_accessed_books(p_user_id BIGINT, p_limit INTEGER DEFAULT 10)
RETURNS TABLE (
    book_id BIGINT,
    book_title VARCHAR,
    last_accessed TIMESTAMP,
    last_chapter_index INTEGER
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        b.id AS book_id,
        b.title AS book_title,
        ub.last_accessed,
        ub.last_chapter_index
    FROM user_books ub
    JOIN books b ON b.id = ub.book_id
    WHERE ub.user_id = p_user_id
    AND ub.last_accessed IS NOT NULL
    ORDER BY ub.last_accessed DESC
    LIMIT p_limit;
END;
$$;