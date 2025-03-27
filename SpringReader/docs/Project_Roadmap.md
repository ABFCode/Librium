# SpringReader Project Roadmap








# Current project overview 3/27:



# Current Features:

## Overview of current project status 2/28:

My application has made significant progress towards implementing all the functionality I wanted.
A lot of the core functionality has been put into place, and the project is already capable at least locally, of 
functioning as a very basic e-reader. In that you can upload an epub file, have it parsed and returned for reading on 
my frontend. As well as a full user/auth system implemented using Spring Security and JWTs. 

The project is entirely local at the moment, using an im-memory h2 database and Spring Data JPA to interact with it.


### 1. User Auth
- **User Auth:**
  - Full Spring Security setup using JSON Web Tokens
  - Currently using an in-memory h2 database to store our users.
  - Can register a new user, login with a user. 
  - Passwords are encoded for storage, decoded on auth.


### 2. File Upload & Storage
- **File Upload Endpoint:**  
  - Users can now upload epub files, right now they just go towards an Uploads directory in the project dir that is wiped on restart. 
  - Books are not currently tied to a user.
- **Metadata**
  - Book metadata is saved to DB

### 3. Book Management
- **Database Integration:**  
  - The project uses Spring Data JPA to interact with the database, allowing for the persistence of book metadata. 
  - Implemented service layer works for validating and adding new book entities.
  - Implemented endpoints allow for:
    - Retrieving all books
    - Adding new books
    - Retrieving metadata on a book
    - Retrieving the content for a given chapter index in a book

### 4. EPUB Parsing 
- **Chapter & Metadata Retrieval:**
  - Capable of extracting metadata(just title, toc, author currently) and chapter content from a given epub.
  - Parsed data is structured out into custom models, allowing for easier modification when we add to the parsing logic. 
- **Parsing Utility:**  
  - The EPUB parsing utility is mostly functional, at least the important bits are there.
    - Uses standard XML parsing with DocumentBuilder to work through multiple files and metadata.
    - Uses JSoup to convert HTML chapter into Document objects. Allows for easier extraction of paragraphs and headings.
    - Currently we are ignoring most of the HTML in our EPUBs, although we still respect paragraph and header tags. 
    - Handles cases where there are multiple chapters within a single html document by using a provided anchor. 


### 5. MVC Structure & Documentation
- **Clear Separation of Concerns:**  
  - The application attempts adheres to the MVC pattern, with clearly separated controllers, services, and model layers. 
  - Promotes enhanced maintainability, readability, and modification. 
- **JavaDoc Documentation:**  
  - JavaDoc comments have been added to key classes and methods.

### 6.  Reading Interface
- **Display Book Content**
  - Show the text content of the book in a clean format.
  -  Navigation (next/previous page, scrolling, search).
-  **Bookmarks & Preferences**
  - Allow users to bookmark pages.
  - Enable settings for themes (light/dark) and text size.


# Finished Goal:

## Project Description and Purpose

SpringReader is a web-based e-book reader application designed to provide users with a 
clean and simple experience for uploading, storing, and reading their own digital books. 

The main purpose of the project is to allow users to easily manage their personal 
virtual libraries by enabling them to upload and download various digital book formats. 
The user will also be able to access a clean, intuitive reading interface through the same web portal. 

The users reading progress will be synced to the user and book. Allowing for the ability to pick up a book right where you 
left off on a different device. 

The application will be performance focused, there should be minimal loading between chapters and books. Attempting to mimic
as if you were reading it on a local app.

## Objectives

- **Reliable File Upload/Download & Storage:** Users will be able to upload and download their digital books securely. 
  - The application saves file metadata along with the actual file locally and digitally to ensure reliable management and retrieval.
- **Efficient File Parsing:** All important data from a given ebook will be parsed and extracted out. 
  - Accessible through various endpoints.
  - Multiple file formats accepted, at least .txt and epub. PDF later and maybe MOBI if possible.
- **User-Focused:** Thorough Authentication and user profile management. 
  -  Personalized features such as bookmarking, theme preferences, and reading progress synchronization across devices.
- **Enhanced Interaction Modes:** While the core reading mode is the primary focus, 
  - optional features like light editing (such as highlighting and minor text changes) as well as searching will be explored.
- **Robust Testing and Documentation:** With plans to include comprehensive 
  - JUnit tests and detailed JavaDoc comments. Would like to have much more thorough testing rather than just simple JUnit tests.
  - Full E2E as well as mocked tests for anything relevant/important. 
- **Behavioral Patterns implemented:** With plans to incorporate at least
  - one additional behavioral pattern (strategy) to handle the different file types we will be parsing.

## Intended Audience

Anyone who has a bunch of digital books and tends to read on a variety of devices. Or someone who just wants
a clean and performance focused way to read their books anywhere. 

## The Service Offered

A user-friendly digital reading service that integrates file upload, download, 
and an intuitive reading interface. Users can securely sign up and log in 
to maintain personalized settings and reading progress. Once logged in, 
they can upload or download their books and have the server extract and display content seamlessly.