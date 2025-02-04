# Plan for SpringReader Application


## Current Plan
- **Spring Boot**
  - Rest endpoint for reading/parsing an epub
  - Parse epub
  - Returns parsed epub
- **React**
  - Simple component for calling our backend just a button probably
  - Display parsed content

## Project Description

This application is a web-based e-reader designed to let users upload, store, and read their digital books.

---

## Project Requirements

- **User Authentication & Syncing**
    - Users must be able to register, log in, and manage their profiles.
    - Authentication is required to access personalized features like bookmarks, themes, and reading progress.

- **File Upload & Storage**
    - Allow users to upload e-books in EPUB, possibly others in the future (MOBI,TXT,PDF)
    - Store file metadata (title, author, format, upload date) in a DB
    - Save the actual files initially locally, likely have to store on the cloud later (Supabase/S3).
      - Could also just require that they upload the book on each device.

- **Reading Functionality**
    - Display uploaded books in a simple react-based reader available through some web portal.
    - Provide basic navigation through the book.
    - Allow users to set bookmarks and adjust display settings (themes, font size).

- **Editing & State Management (Optional)**
    - Provide light editing capabilities on text-based files. (highlighting, text changes)
    - Use the State pattern to toggle between reading mode and editing mode, and to manage different themes (light/dark).

- **Testing & Documentation**
    - Include JUnit tests.
    - JavaDoc comments.
    - MVC Pattern.

---



## Application Features

### **Feature 1: User Authentication**
1. **Login/Registration**
    - Users can sign up with an username and password.
    - Basic validation.
2. **Profile & Syncing**
    - Store and retrieve user (theme, reading progress, bookmarks).

### **Feature 2: File Upload & Storage**
1. **File Upload**
    - Provide a way to upload. 
    - Validate.
2. **File Management**
    - Save file metadata in the db.

### **Feature 3: Reading Interface**
1. **Display Book Content**
    - Show the text content of the book in a clean format.
    -  Navigation (next/previous page, scrolling, search).
2. **Bookmarks & Preferences**
    - Allow users to bookmark pages.
    - Enable settings for themes (light/dark) and text size.

### **Feature 4: Editing Mode (Optional)**
1. **Toggle Mode**
    - Use the State pattern to switch between reading and editing modes.
2. **Basic Text Editing**
    - Allow minimal editing (e.g., highlighting or simple text modifications).
    - Save changes locally and update file metadata if needed.

---

## MVC (plan)

### **Model**
1. **User**
    - Fields: ID, email, password, settings (theme, reading progress), etc.
2. **Book**
    - Fields: ID, title, author, format, file path/URL, upload date, etc.
3. **Bookmark**
    - Fields: ID, user ID, book ID, page number or location, description.
4. **State Management (Mode)**
    - Reading/Editing

### **Controller**
1. **UserController**
    - Manages registration, login, and profile updates.
2. **BookController**
    - Handles file uploads, downloads, and metadata stuff.
3. **FileParsing**
    - Processes uploaded files in order to display on our frontend
      - Depending on difficulty, may need to use a library. 

### **View**
1. **React**
    - **Authentication Pages:** Login and Registration forms.
    - **Dashboard:** Library of books and navigation.
    - **Reader Interface:** Displays book content with navigation
    - **Editor Interface:** (Maybe) A simple overlay for minor edits.
2. **API Communication**
    - Fetch to connect to backend REST endpoints.

---

## Additional 

### **Testing & Documentation**
- **JUnit Tests:**
    - Write tests for each used method
- **Documentation:**
    - Provide JavaDoc comments throughout the backend code.

---

## Final Reminders

- **Documentation:** Include JavaDoc comments for all methods and classes.
- **Testing:** Ensure that each part has corresponding JUnit tests.
- **Modularity:** Adhere to MVC pattern
- **Project Roadmap:** Describe what has been completed and what I am planning to implement. 
