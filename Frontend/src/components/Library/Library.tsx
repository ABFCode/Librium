import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import auth from "../../utility/auth";
import ThemeToggle from "../ThemeToggle";
import { ApiError, apiService, Book } from "../../services/apiService";

interface BookToDelete {
  id: string;
  title: string;
}

function Library() {
  const navigate = useNavigate();
  const [books, setBooks] = useState<Book[]>([]);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string>("");
  const [bookToDelete, setBookToDelete] = useState<BookToDelete | null>(null);

  const loadBooks = useCallback(async (): Promise<void> => {
    try {
      const books = await apiService.getLibrary();
      setBooks(books);
      setError("");
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

  const requestDeleteConfirmation = (
    e: React.MouseEvent,
    bookId: string,
    bookTitle: string
  ) => {
    e.stopPropagation();
    e.preventDefault();
    setBookToDelete({ id: bookId, title: bookTitle });
  };

  const handleConfirmDelete = async () => {
    if (!bookToDelete) return;

    const bookIdToDelete = bookToDelete.id;
    setBookToDelete(null);

    try {
      setError("");
      await apiService.deleteBook(bookIdToDelete);
      await loadBooks();
    } catch (error) {
      console.error("Failed to delete book: ", error);
      if (error instanceof ApiError) {
        if (error.details.status === 401 || error.details.status === 403) {
          console.log("Unauthorized, redirecting to sign-in");
          auth.handleUnauthorized(navigate);
        } else {
          setError(
            `Failed to delete book: ${
              error.details.detail || error.details.title || "Server Error"
            }`
          );
        }
      } else if (error instanceof Error) {
        setError(`Failed to delete book: ${error.message}`);
      } else {
        setError(`Failed to delete book: Very unexpected error`);
      }
    }
  };

  const handleCancelDelete = () => {
    setBookToDelete(null);
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

      {error && !bookToDelete && (
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
          <div
            key={book.id}
            className="flex flex-col bg-base-100 rounded shadow hover:shadow-md transition-shadow duration-200"
          >
            <Link to={`/epub/${book.id}`}>
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
            </Link>

            <div className="p-2 flex">
              <div className="flex-grow min-w-0">
                <h2 className="text-sm font-semibold text-base-content truncate">
                  {book.title}
                </h2>
                <h2 className="text-xs text-base-content/70 truncate">
                  {book.author}
                </h2>
              </div>
              <button
                onClick={(e) =>
                  requestDeleteConfirmation(e, book.id, book.title)
                }
                className="btn btn-ghost btn-xs p-0 h-6 w-6 flex-shrink-0"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                  />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>

      {bookToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
          <div className="bg-base-100 p-6 rounded-lg shadow-xl max-w-sm w-full">
            <h3 className="text-lg font-bold mb-4 text-base-content">
              Confirm Deletion
            </h3>
            <p>
              Are you sure you want to permanently delete{" "}
              <strong>"{bookToDelete.title}"</strong> This action cannot be
              undone.
            </p>
            {error && (
              <div>
                <span className="alert alert-error text-sm p-2">
                  Error: {error}
                </span>
              </div>
            )}
            <div>
              <button onClick={handleCancelDelete} className="btn btn-ghost">
                Cancel
              </button>
              <button onClick={handleConfirmDelete} className="btn btn-ghost">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Library;
