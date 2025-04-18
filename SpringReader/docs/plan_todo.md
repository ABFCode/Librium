# Plan for SpringReader Application


## FIX
### BACKEND ###

REMOVE H2 LEGACY STUFF
1. Remove anything still related to our H2 DB - esp. security related stuff.

TESTS
Fix broken tests. 

OTHER
~~1. Image controller is sending JPEG filetype as default, could be PNG.~~

### FRONT END ###

Phone: Remove chapter nav arrows for phone size





## DO

1. Endpoint naming overhaul
2. Storage limit for users
3. Change image to thumbnail.
7. More robust validation for uploads.
9. Reader Changes: Font size, font, spacing, margin, etc. 
10. Scroll pos. sync
11. Reading progress indicator
12. Search impl.
    - Could do in frontend or backend, could be a major change. 
    - Would be much easier on backend, after we do #4 (Store only parsed parts)
13. Library management/organization/searching. 
14. Cover placeholder image
    - Generate a blank image with the title of the book maybe?
15. CoverImage endpoint
    - move logic to a service class or method
    - No reason to use coverimage path or stream all userBooks
    - Just send bookID and combine with userID



UI CHANGES:
1. a component for the nav bar.
2. Make things more consistent throughout.
3. Change book card sizes
4. Colors for light theme aren't great
5. I don't like how we're doing upload. Looks and feels old, at least drag and drop impl. 
6. Prev/Next buttons on EBOOK reader, not great. Replace it with arrows or nothing? Like Kindle. (see Kindle.png)

RESEARCH/PLAN:
1. (MAJOR CHANGE) Local/Caching. See what we can do in terms of local storage.
    - Look into indexedDB.
    - Service Workers
    - Caching on backend too (Redis?)
2. (MAJOR CHANGE) Store only necessary parts of EPUBs
    - We are storing the entire EPUB files, but only using the cover image and content text after parsing.
    - We could store the parsed chapter content and the modified image. Not sure if this will help.
3. TXT Files: Plan for these
   - Generic BookParser, which our Epub and Txt parser will impl. (Strategy pattern)
4. Research Kindle formats, see if they're possible.
5. Spring Reactive
   - https://filia-aleks.medium.com/microservice-performance-battle-spring-mvc-vs-webflux-80d39fd81bf0
6. Protect against XXE XML PARSING
7. Connect Gutenberg/Other copyright-free book sites. 
8. Page-based instead of chapter-based.

VPS:
1. Fail2Ban
2. Basic load balancing through docker/Traefik


# OG PLAN #
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
