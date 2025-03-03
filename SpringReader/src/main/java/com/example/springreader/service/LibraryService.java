package com.example.springreader.service;

import com.example.springreader.model.Book;
import com.example.springreader.model.EpubChapter;
import com.example.springreader.model.EpubContentFile;
import com.example.springreader.model.EpubToc;
import com.example.springreader.repository.BookRepository;
import com.example.springreader.utility.EpubParser;
import org.springframework.stereotype.Service;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Provides methods to interact with our bookRepo thereby interacting with our DB. Right now we can jsut add a book
 * and list all of them.
 */
@Service
public class LibraryService {
    private final BookRepository bookRepository;

    public LibraryService(BookRepository bookRepository){
        this.bookRepository = bookRepository;
    }


    /**
     * Adds a new book to the repository (which will save it to our DB)
     *
     * @param epubFile the EPUB file containing the book's info
     * @return the saved Book object
     */
    public Book addBook(File epubFile){
        Map<String, Object> meta = EpubParser.parseMeta(epubFile);
        String title = EpubParser.getTitle(meta);
        String author = EpubParser.getAuthor(meta);

        Book book = new Book(title, author, epubFile.getAbsolutePath());
        return  bookRepository.save(book);
    }








    /**
     * Lists all books
     * @return A list of all books in our DB
     */
   public List<Book> ListAll(){
        return bookRepository.findAll();
   }

    /**
     * Flatterns the toc object into a single list of epubchapter objects.
     * It does this by iterating through each content file, extracting all the chapters, and appending them to a single
     * list.
     * @param toc Our EpubToc object
     * @return A list of chapters in order
     */
    public List<EpubChapter> flattenToc(EpubToc toc) {
        List<EpubChapter> flattenedToc = new ArrayList<>();
        if(toc != null && toc.getContentFiles() != null){
            for (EpubContentFile contentFile : toc.getContentFiles()){
                flattenedToc.addAll(contentFile.getChapters());
            }
        }
        return flattenedToc;
    }

    /**
     * Retrieves the meta from our parseMeta method, flattens the toc and replaces the one in meta.
     * @param epubFile File object representing an epub
     * @return Our adjusted meta object containing the flattened toc
     */
    public Map<String, Object> getBookMeta(File epubFile){
       Map<String, Object> meta = EpubParser.parseMeta(epubFile);
       if (meta.containsKey("toc")){
           EpubToc toc = (EpubToc) meta.get("toc");
           List<EpubChapter> chapters = flattenToc(toc);
           meta.put("flatToc", chapters);
           meta.remove("toc");
       }
       return meta;
    }




}
