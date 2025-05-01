//package com.example.springreader.utility;
//
//import com.example.springreader.model.EpubChapter;
//import com.example.springreader.model.EpubContentFile;
//import com.example.springreader.model.EpubToc;
//import lombok.extern.slf4j.Slf4j;
//import org.junit.jupiter.api.BeforeEach;
//import org.junit.jupiter.api.Test;
//
//import java.io.File;
//import java.util.Map;
//
//import static org.junit.jupiter.api.Assertions.*;
//
//@Slf4j
//class EpubParserTest {
//
//    private File validEpubFile;
//    private File invalidEpubFile;
//    private File nonExistentFile;
//
//    /**
//     * Place a valid epub and an invalid.txt in the directories below
//     */
//    @BeforeEach
//    void setUp() {
//        validEpubFile = new File("src/test/resources/valid.epub");
//        invalidEpubFile = new File("src/test/resources/invalid.txt");
//        nonExistentFile = new File("src/test/resources/doesnotexist.epub");
//    }
//
//    /**
//     * Tests that metadata is correctly extracted from a valid EPUB file.
//     * Tests that it can extract the Title/Author/Toc from our metadata.
//     */
//    @Test
//    void parseMeta_ValidEpub_returnsMetadata() {
//        //Skip if test file doesn't exist
//        if (!validEpubFile.exists()) {
//            log.info("Valid EPUB test file not available");
//            return;
//        }
//
//        Map<String, Object> metadata = EpubParser.parseMeta(validEpubFile);
//
//        assertNotNull(metadata);
//        assertNotNull(EpubParser.getTitle(metadata));
//        assertNotNull(EpubParser.getAuthor(metadata));
//        assertNotNull(EpubParser.getToc(metadata));
//    }
//
//    /**
//     * Tests handling of an invalid EPUB file.
//     * The implementation should return a map without the expected data.
//     */
//    @Test
//    void parseMeta_InvalidEpub_handlesInvalidFile() {
//        //Skip if test file doesn't exist
//        if (!invalidEpubFile.exists()) {
//            log.info("Invalid test file not available");
//            return;
//        }
//
//        Map<String, Object> metadata = EpubParser.parseMeta(invalidEpubFile);
//
//        assertNotNull(metadata, "Should return a non-null map even for invalid files");
//        //The map may not be empty, but should not contain complete metadata
//        assertTrue(
//                EpubParser.getTitle(metadata) == null ||
//                        EpubParser.getAuthor(metadata) == null ||
//                        EpubParser.getToc(metadata) == null,
//                "Invalid files should not have complete meta data"
//        );
//    }
//
//    /**
//     * Tests that chapter content is extracted properly from a valid EPUB.
//     */
////    @Test
////    void parseContent_ValidEpubAndValidIndex_returnsChapterContent() {
////        //Skip if test file doesn't exist
////        if (!validEpubFile.exists()) {
////            log.info("Valid EPUB test file not available");
////            return;
////        }
////
////        Map<String, Object> content = EpubParser.parseContent(validEpubFile, 0);
////
////        assertNotNull(content);
////        assertTrue(content.containsKey("chapterContent"));
////        assertNotNull(content.get("chapterContent"));
////        assertFalse(((String)content.get("chapterContent")).isEmpty());
////    }
//
//    /**
//     * Tests that an empty or incomplete map is returned when trying to parse content with an invalid index.
//     */
//    @Test
//    void parseContent_InvalidIndex_returnsIncompleteMap() {
//        // Skip if test file doesn't exist
//        if (!validEpubFile.exists()) {
//            log.info("Valid EPUB test file not available");
//            return;
//        }
//
//        Map<String, Object> content = EpubParser.parseContent(validEpubFile, 9999);
//
//        assertNotNull(content);
//        //Either the map is empty or it doesn't contain valid chapter content
//        assertTrue(
//                content.isEmpty() || !content.containsKey("chapterContent") ||
//                        content.get("chapterContent") == null,
//                "Invalid index should not return valid chapter content"
//        );
//    }
//
//    /**
//     * Tests that the TOC was correctly constructed
//     */
//    @Test
//    void parseMeta_ValidEpub_returnsValidToc() {
//        // Skip if test file doesn't exist
//        if (!validEpubFile.exists()) {
//            log.info("Valid EPUB test file not available");
//            return;
//        }
//
//        Map<String, Object> metadata = EpubParser.parseMeta(validEpubFile);
//
//        assertNotNull(metadata);
//        EpubToc toc = EpubParser.getToc(metadata);
//        assertNotNull(toc);
//
//        //Check content files exist
//        assertFalse(toc.getContentFiles().isEmpty());
//
//        //Check first content file
//        EpubContentFile firstContentFile = toc.getContentFiles().get(0);
//        assertNotNull(firstContentFile);
//        assertNotNull(firstContentFile.getFilePath());
//
//        //Check chapters exist
//        assertFalse(firstContentFile.getChapters().isEmpty());
//
//        //Check first chapter
//        EpubChapter firstChapter = firstContentFile.getChapters().get(0);
//        assertNotNull(firstChapter);
//        assertNotNull(firstChapter.title());
//        log.info(firstChapter.title());
//        assertNotEquals(0, firstChapter.title().length());
//        assertTrue(firstChapter.index() >= 0);
//    }
//
//    /**
//     * Tests for null file parameter handling
//     */
//    @Test
//    void parseMeta_NullFile_isHandled() {
//        Map<String, Object> metadata = EpubParser.parseMeta(null);
//
//        assertNotNull(metadata, "Should handle null file gracefully");
//        assertTrue(metadata.isEmpty(), "Should return empty map for null file");
//    }
//
//    /**
//     * Tests for non-existent file handling
//     */
//    @Test
//    void parseMeta_NonExistentFile_isHandled() {
//        Map<String, Object> metadata = EpubParser.parseMeta(nonExistentFile);
//
//        assertNotNull(metadata, "Should handle non-existent file gracefully");
//        assertTrue(metadata.isEmpty(), "Should return empty map for non-existent file");
//    }
//
//    /**
//     * Tests for null file parameter in content parsing
//     */
//    @Test
//    void parseContent_NullFile_isHandledl() {
//        Map<String, Object> content = EpubParser.parseContent(null, 0);
//
//        assertNotNull(content, "Should handle null file gracefully");
//        assertTrue(content.isEmpty(), "Should return empty map for null file");
//    }
//}
