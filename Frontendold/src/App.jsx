import { useEffect, useState } from "react";
import "./App.css";
import BookList from "./components/BookList";

function App() {
  const [books, setBooks] = useState([]);
  const [selectedBook, setSelectedBook] = useState(null);

  useEffect(() => {
    loadBooks();
  }, []);

  const loadBooks = async () => {
    try {
      const response = await fetch("http://localhost:8080/library");
      const data = await response.json();
      setBooks(data);
    } catch (e) {
      console.error("Error getting books", e);
    }
  };
  return (
    <div className="app">
      {selectedBook ? (
        <div>
          <h1>Reader</h1>
          <button onClick={() => selectedBook(null)}>Library</button>
        </div>
      ) : (
        <BookList books={books} onBookSelect={selectedBook} />
      )}
    </div>
  );
}

export default App;
