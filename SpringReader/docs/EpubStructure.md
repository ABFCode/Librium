# How EPUB files work

##
- **Essentially just an archive like a zip file**
    - Three primary components; `META-INF`, `OEBPS`, and `mimetype`.
- **Mime Type**
    - The `mimetype` file is a simple text file that contains the string `application/epub+zip`.
    - This file is used to identify the file as an EPUB file.
- **META-INF**
  - Contains metadata about the EPUB file.
  - Typically holds just a single XML file called `container.xml`.
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

---

##
Will need to carefully handle each epub separately. Besides the mandatory files, the structure can vary greatly. 


## References
1. https://www.editepub.com/understanding-the-epub-format/