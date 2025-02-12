import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import "./Library.css";

interface Book {
  id: number;
  title: string;
  author: string;
  filePath: string;
}

function Library() {
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
    </>
  );
}

export default Library;
