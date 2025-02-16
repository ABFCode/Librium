import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "./Library.css";
import auth from "../../utility/auth";

interface Book {
  id: string;
  title: string;
  author: string;
}

function Library() {
  const navigate = useNavigate();
  const [books, setBooks] = useState<Book[]>([]);

  useEffect(() => {
    // Check if user is authenticated
    if (!auth.isAuthenticated()) {
      navigate("/signin");
      return;
    }
    loadBooks();
  }, [navigate]);

  const loadBooks = async (): Promise<void> => {
    try {
      const response = await fetch("http://localhost:8080/library", {
        headers: auth.getAuthHeaders(),
      });

      if (response.status === 401) {
        auth.logout();
        return;
      }

      const data: Book[] = await response.json();
      setBooks(data);
    } catch (e: unknown) {
      if (e instanceof Error) {
        console.error("Error fetching books", e);
      }
    }
  };

  const handleLogout = () => {
    auth.logout();
    navigate("/signin");
  };

  return (
    <div className="library-page">
      <header className="library-header">
        <h1>Library</h1>
        <div className="user-controls">
          <button onClick={handleLogout} className="logout-button">
            Logout
          </button>
        </div>
      </header>
      <div className="library-container">
        <ul className="cards">
          {books.map((book) => (
            <li key={book.id}>
              <Link to={`/epub/${book.id}`} className="card">
                <img src={"book.jpg"} style={{ width: "100%" }} />
                <div className="container">
                  <h4>{book.title}</h4>
                  <p>{book.author}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default Library;
