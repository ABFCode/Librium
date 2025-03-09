import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import auth from "../../utility/auth";
import ThemeToggle from "../ThemeToggle";

interface BookDTO {
  id: string;
  title: string;
  author: string;
  lastChapterIndex: number;
  coverImagePath: string;
}

function Library() {
  const navigate = useNavigate();
  const [books, setBooks] = useState<BookDTO[]>([]);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8080/api";

  useEffect(() => {
    const checkAuth = async () => {
      const isAuthenticated = await auth.isAuthenticated();
      if (!isAuthenticated) {
        console.log("Not authenticated");
        navigate("/signin");
        return;
      }
      console.log("Authenticated");
      loadBooks();
    };
    checkAuth();
  }, [navigate]);

  const loadBooks = async (): Promise<void> => {
    try {
      const response = await fetch(`${API_URL}/library`, {
        credentials: "include",
      });

      if (response.status === 401) {
        auth.logout();
        return;
      }

      const data: BookDTO[] = await response.json();
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
      const response = await fetch(`${API_URL}/library/upload`, {
        method: "POST",
        credentials: "include",
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
    <div className="p-6 bg-base-200 min-h-screen">
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-primary">Library</h1>
        <div className="flex gap-4 items-center">
          <ThemeToggle />
          <button
            onClick={() => setShowUploadForm(!showUploadForm)}
            className="btn btn-accent"
          >
            {showUploadForm ? "Cancel" : "Add Book"}
          </button>
          <button onClick={handleLogout} className="btn btn-error">
            Logout
          </button>
        </div>
      </header>

      {showUploadForm && (
        <div className="bg-base-100 p-4 rounded mb-6 shadow-md">
          <h3 className="text-lg font-bold mb-4 text-secondary">Upload EPUB</h3>
          <input
            type="file"
            accept=".epub"
            onChange={handleFileChange}
            className="file-input file-input-bordered w-full mb-4"
          />
          <button
            onClick={handleUpload}
            disabled={!selectedFile || isUploading}
            className="btn btn-primary"
          >
            {isUploading ? "Currently Uploading..." : "Upload"}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {books.map((book) => (
          <Link
            to={`/epub/${book.id}`}
            key={book.id}
            className="block bg-base-100 shadow-md rounded p-4 hover:shadow-lg"
          >
            <img
              src={`${import.meta.env.VITE_API_URL}/covers/${book.coverImagePath
                .split("/")
                .pop()}`}
              alt={book.title}
              className="w-full h-48 object-cover rounded mb-4"
            />
            <h4 className="text-lg font-bold text-primary">{book.title}</h4>
            <p className="text-base-content/70">{book.author}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default Library;
