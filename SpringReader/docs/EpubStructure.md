# How EPUB files work

##
- **Essentially just an archive like a zip file**
    - Three primary components; `META-INF`, `OEBPS`, and `mimetype`.
- **Mime Type**
    - The `mimetype` file is a simple text file that contains the string `application/epub+zip`.
    - This file is used to identify the file as an EPUB file.
- **META-INF**
  - Contains metadata about the EPUB file.
  - Typically, holds just a single XML file called `container.xml`.
  - The purpose of container.xml is to point to the location of the `package.opf` file.
  - Which instructs the application on where to find and how to process the contents of the book.
- **OEBPS**
  - Where the actual content of the book is stored.
  - Text, images, fonts, stylesheets, etc.
  - Three mandatory files:
    - `content.opf` or `package.opf` - The primary metadata file. Contains the structural data about the book.
    - `toc.ncx` - The table of contents. Deprecated in EPUB 3, still used though.
    - `css` - Stylesheets for the book.
- **.opf**
    -  <metadata> - Contains information about the book such as title, author, language, etc.
    -  <manifest> - A list of all the files in the book.
    -  <spine> - The order in which the files should be displayed. The HTML/XHTML files that make up the book.
    -  <guide> - Optional, contains information about the book's navigation. Deprecated in EPUB 3.
    
Will need to carefully handle each epub separately. Besides the mandatory files, the structure can vary greatly from my testing. 
Some are very barebones, while others have a lot of extra files.

---

##
**Plan to parse just the text**
1. Open the EPUB as a zip file.
2. Locate `container.xml`
3. Parse the xml, in java you can do this by using the `DocumentBuilder` class. 
I found https://www.youtube.com/watch?v=w3WibDOie1Y, which I'll likely follow.
4. Extract the path to the `.opf` file.
5. Open the OPF file using the path
6. Parse the OPF file (it's XML based as well)
7. Use the `idref` from `itemref` to find the matching `<item>` in the manifest which gives us our actual path to the content.
8. Open the content file and return the text.
9. Read file contents as a string and display (for now).

---

Doing testing using: https://www.gutenberg.org/ebooks/11 (Alice in Wonderland)  
Using all 3 of their EPUB options.


## References
1. https://www.editepub.com/understanding-the-epub-format/