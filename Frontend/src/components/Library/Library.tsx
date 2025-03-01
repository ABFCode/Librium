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
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      const response = await fetch("http://localhost:8080/library/upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${auth.getToken()}`,
        },
        body: formData,
      });

      if (response.ok) {
        loadBooks();
        setShowUploadForm(false);
        setSelectedFile(null);
      } else {
        console.error("Upload failed");
      }
    } catch (error) {
      console.error("Error uploading file:", error);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="library-page">
      <header className="library-header">
        <h1>Library</h1>
        <div className="user-controls">
          <button
            onClick={() => setShowUploadForm(!showUploadForm)}
            className="upload-button"
          >
            {showUploadForm ? "Cancel" : "Add Book"}
          </button>
          <button onClick={handleLogout} className="logout-button">
            Logout
          </button>
        </div>
      </header>

      {showUploadForm && (
        <div className="upload-form-container">
          <div className="upload-form">
            <h3>Upload EPUB</h3>
            <input type="file" accept=".epub" onChange={handleFileChange} />
            <button
              onClick={handleUpload}
              disabled={!selectedFile || isUploading}
            >
              {isUploading ? "Currently Uploading..." : "Upload"}
            </button>
          </div>
        </div>
      )}

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
