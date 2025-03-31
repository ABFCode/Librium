import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import auth from "../../utility/auth";
import ThemeToggle from "../ThemeToggle";
import { apiService, Book } from "../../services/apiService";

function Library() {
  const navigate = useNavigate();
  const [books, setBooks] = useState<Book[]>([]);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const loadBooks = useCallback(async (): Promise<void> => {
    const books = await apiService.getLibrary();
    setBooks(books);
  }, []);

  useEffect(() => {
    const checkAuth = async () => {
      const isAuthenticated = await auth.isAuthenticated();
      if (!isAuthenticated) {
        console.log("Not authenticated");
        navigate("/signin");
        return;
      }
      //console.log("Authenticated");
      loadBooks();
    };
    checkAuth();
  }, [navigate, loadBooks]);

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

    if (
      !selectedFile.name.toLowerCase().endsWith(".epub") ||
      selectedFile.type !== "application/epub+zip"
    ) {
      alert("Please select a valid EPUB file.");
      return;
    }

    setIsUploading(true);
    try {
      await apiService.uploadBook(selectedFile);
      loadBooks();
      setShowUploadForm(false);
      setSelectedFile(null);
    } catch (error) {
      console.error("Upload failed:", error);
      alert(
        `Upload failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-8 gap-6">
        {books.map((book) => (
          <Link
            to={`/epub/${book.id}`}
            key={book.id}
            className="block bg-base-200 shadow-md rounded p-4 hover:shadow-lg"
          >
            <img
              src={`${import.meta.env.VITE_API_URL}/covers/${book.coverImagePath
                .split("/")
                .pop()}`}
              alt={book.title}
              className="w-full h-48 object-contain rounded mb-4"
            />
          </Link>
        ))}
      </div>
    </div>
  );
}

export default Library;
