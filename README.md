# Librium - Personal Ebook Library & Reader

<p align="center">
  <!-- Corrected path with capital 'F' -->
  <img src="./Frontend/public/book-opened.svg" alt="Librium Logo" width="120"/>
</p>


Librium is a self-hosted, web-based application designed for uploading, storing, managing, and reading your personal digital book collection. It primarily focuses on the EPUB format and aims to provide a clean, simple interface to access your library across different devices.

The project consists of:
*   **Frontend:** A React application (built with Vite + TypeScript) providing the user interface.
*   **Backend (SpringReader):** A Spring Boot application handling user authentication, book processing, storage management, and API endpoints.

---

> **⚠️ Status: Active Development ⚠️**
>
> Librium is currently under **heavy active development** and is **not yet ready for production or general use**. Features are incomplete, APIs might change, and stability is not guaranteed. Expect bugs and potential data loss. **Use at your own risk!**
>
> *User-friendly installation instructions (including Docker setup) will be provided soon. 

---

## ✨ Features (Current State)

Even in its early stage, Librium offers several core functionalities:

*   **User Authentication:** Secure registration and login using JWT stored in HTTP-only cookies.
*   **EPUB Upload & Processing:** Upload your `.epub` files to your personal library. The backend parses metadata (title, author, ToC) and cover images.
*   **Library Management:**
    *   View your uploaded books with cover images (if available), titles, and authors.
    *   Download your original EPUB files.
    *   Delete books from your library.
*   **Web Reader:**
    *   Read EPUB content directly in the browser.
    *   Navigate between chapters using Next/Previous controls or the Table of Contents drawer.
    *   Basic keyboard navigation (left/right arrows).
*   **Progress Syncing:** Automatically saves and resumes your reading progress at the last visited chapter for each book.
*   **Theme Toggle:** Switch between light and dark themes for the interface.

---

## 🛠️ Technology Stack

*   **Frontend:** React 19, TypeScript, Vite, Tailwind CSS, DaisyUI, React Router
*   **Backend:** Java 17+, Spring Boot 3, Spring Security (JWT), Spring Data JPA
*   **Database:** PostgreSQL
*   **Parsing:** Jsoup (HTML parsing for content), Java XML APIs (EPUB structure)
*   **Containerization:** Docker, Docker Compose
*   **Deployment Example:** Traefik (Reverse Proxy for HTTPS/Routing in `docker-compose.prod.yml`)

---

## 🚀 Future Plans & Roadmap (High-Level)

This project is evolving. Some key areas planned for future development include:

*   **Enhanced Reader Experience:** Font customization, line spacing/margins, scroll position saving, in-book search, progress indicators.
*   **Improved Library Management:** Sorting, filtering, searching, collections/tagging.
*   **Performance & Scalability:** Caching (e.g., Redis), optimizing EPUB parsing/storage.
*   **UI/UX Refinements:** Intuitive controls, responsiveness, error/loading states.
*   **More Robust EPUB Parsing:** Enhancing the EPUB parser for better compatibility and metadata extraction (potentially leveraging or adapting existing libraries).
*   **Broader Format Support:** Investigating support for `.txt` and potentially others.
*   **External Source Integration:** Exploring integration with sources like Project Gutenberg, Standard Ebooks, etc., for direct browsing and downloading.
*   **Simplified Deployment:** Providing streamlined Docker configurations for easier self-hosting.
*   **Stability & Robustness:** Comprehensive error handling, increased test coverage.
*   **Accessibility:** Auditing and improvements.

*(See `SpringReader/docs/plan_todo.md` for more granular details if that file exists)*

---


## 🤝 Contributing

Given the early and active development stage, formal contributions are not the primary focus. However, if you encounter bugs or have specific feature suggestions, feel free to:

1.  **Open an Issue:** Describe the bug or enhancement request clearly on the GitHub repository's Issues page.
2.  **Fork and Experiment:** You're welcome to fork the repository and experiment, but be aware that the main branch may undergo significant changes.

---

## 📜 License

This project is licensed under the **Apache License 2.0**. See the [LICENSE](LICENSE) file for details.
