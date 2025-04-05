import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import auth from "../../utility/auth";
import ThemeToggle from "../ThemeToggle";
import { ApiError, apiService, Book } from "../../services/apiService";

function Library() {
  const navigate = useNavigate();
  const [books, setBooks] = useState<Book[]>([]);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string>("");

  const loadBooks = useCallback(async (): Promise<void> => {
    try {
      const books = await apiService.getLibrary();
      setBooks(books);
    } catch (error) {
      console.error("Failed to load Library: ", error);
      if (error instanceof ApiError) {
        if (error.details.status === 401 || error.details.status === 403) {
          auth.handleUnauthorized(navigate);
        } else {
          setError(error.details.detail || "Failed to load library");
        }
      } else if (error instanceof Error) {
        setError(
          `An unexpected error has occured while loading the library: ${error.message}`
        );
      } else {
        setError(`Something very unexpected has happened.`);
      }
    }
  }, [navigate]);

  useEffect(() => {
    const checkAuth = async () => {
      const isAuthenticated = await auth.isAuthenticated();
      if (!isAuthenticated) {
        console.log("Not authenticated");
        auth.handleUnauthorized(navigate);
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
      setError("");
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    if (
      !selectedFile.name.toLowerCase().endsWith(".epub") ||
      selectedFile.type !== "application/epub+zip"
    ) {
      setError("Please select a valid EPUB file.");
      return;
    }

    setIsUploading(true);
    setError("");
    try {
      await apiService.uploadBook(selectedFile);
      loadBooks();
      setShowUploadForm(false);
      setSelectedFile(null);
    } catch (error) {
      console.error("Upload failed:", error);
      if (error instanceof ApiError) {
        if (error.details.status === 401 || error.details.status === 403) {
          console.log("Unauthorized, redirecting to sign-in");
          auth.handleUnauthorized(navigate);
        } else {
          setError(
            `Upload Failed: ${
              error.details.detail ||
              error.details.title ||
              "Unknown server error"
            }`
          );
        }
      } else if (error instanceof Error) {
        setError(`Upload Failed: ${error.message}`);
      } else {
        setError(`Unexpected Error occured`);
      }
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
            onClick={() => {
              setShowUploadForm(!showUploadForm);
              setError("");
            }}
            className="btn btn-accent"
          >
            {showUploadForm ? "Cancel" : "Add Book"}
          </button>
          <button onClick={handleLogout} className="btn btn-error">
            Logout
          </button>
        </div>
      </header>

      {error && (
        <div>
          <span className="alert alert-error">Error: {error}</span>{" "}
        </div>
      )}

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

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols4 lg:grid-cols-5 xl:grid-cols-7 gap-4">
        {books.map((book) => (
          <Link
            to={`/epub/${book.id}`}
            key={book.id}
            className="flex flex-col bg-base-100 rounded shadow hover:shadow-md transition-shadow duration-200"
          >
            <div className="w-full aspect-[2/3] overflow-hidden">
              <img
                src={
                  book.coverImagePath
                    ? `${
                        import.meta.env.VITE_API_URL
                      }/covers/${book.coverImagePath.split("/").pop()}`
                    : "book-opened.svg"
                }
                alt={book.title}
                className="w-full h-full object-fit"
              />
            </div>

            <div className="p-2 flex">
              <div className="flex-grow min-w-0">
                <h2 className="text-sm font-semibold text-base-content truncate">
                  {book.title}
                </h2>
                <h2 className="text-xs text-base-content/70 truncate">
                  {book.author}
                </h2>
              </div>

              <button className="btn btn-ghost btn-xs p-0 h-6 w-6 flex-shrink-0">
                <svg
                  width="800px"
                  height="800px"
                  viewBox="0 0 16 16"
                  xmlns="http://www.w3.org/2000/svg"
                  stroke="currentcolor"
                >
                  <path d="M9.5 13a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm0-5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm0-5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z" />
                </svg>
              </button>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default Library;
