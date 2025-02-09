import { useEffect, useState } from "react";
import "./App.css";

interface Book {
  id: number;
  title: string;
  author: string;
}

function App() {
  const [books, setBooks] = useState<Book[]>([]);

  useEffect(() => {
    loadBooks();
  }, []);

  const loadBooks = async (): Promise<void> => {
    try {
      const response = await fetch("http://localhost:8080/library");
      const data: Book[] = await response.json();
      setBooks(data);
      console.log(data);
    } catch (e: unknown) {
      if (e instanceof Error) {
        console.error("Error fetching default books", e);
      }
    }
  };

  return (
    <>
      <div>
        <ul>
          {books.map((book) => (
            <li key={book.id}>{book.title} monkey</li>
          ))}
        </ul>
      </div>
    </>
  );
}

export default App;
