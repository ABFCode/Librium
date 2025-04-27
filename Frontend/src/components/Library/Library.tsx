import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import auth from "../../utility/auth";
import ThemeToggle from "../ThemeToggle";
import { ApiError, apiService, Book } from "../../services/apiService";
import ErrorAlert from "../UI/ErrorAlert";

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
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

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

  const openDeleteConfirmation = (
    e: React.MouseEvent,
    bookId: string,
    bookTitle: string
  ) => {
    e.stopPropagation();
    e.preventDefault();
    setError("");
    setBookToDelete({ id: bookId, title: bookTitle });
    setIsDeleteModalOpen(true);

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  };

  const closeDeleteModal = () => {
    setIsDeleteModalOpen(false);
    setTimeout(() => {
      setBookToDelete(null);
    }, 300);
  };

  const handleConfirmDelete = async () => {
    if (!bookToDelete) return;

    const bookIdToDelete = bookToDelete.id;

    closeDeleteModal();

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
    closeDeleteModal();
  };

  const handleDownload = async (
    e: React.MouseEvent,
    bookIdToDownload: string,
    bookTitle: string
  ) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      setError("");
      const response = await apiService.downloadBook(bookIdToDownload);
      const blob = await response.blob();

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;

      const filename = `${bookTitle}.epub`;
      link.setAttribute("download", filename);

      document.body.appendChild(link);

      link.click();

      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.details.status === 401 || error.details.status === 403) {
          console.log("Unauthorized, redirecting to sign-in");
          auth.handleUnauthorized(navigate);
        } else {
          setError(
            `Failed to download book: ${
              error.details.detail || error.details.title || "Server error"
            }`
          );
        }
      } else if (error instanceof Error) {
        setError(`Failed to download book: ${error.message}`);
      } else {
        setError(`Failed to download book: Very unexpected error`);
      }
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

      <ErrorAlert message={error} />

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
                    book.hasCoverImage
                      ? apiService.getCoverImage(book.id)
                      : "book-opened.svg"
                  }
                  alt={book.title}
                  className="w-full h-full object-fit"
                />
              </div>
            </Link>

            <div className="p-2 flex items-center">
              <div className="flex-grow min-w-0">
                <h2 className="text-sm font-semibold text-base-content truncate">
                  {book.title}
                </h2>
                <h2 className="text-xs text-base-content/70 truncate">
                  {book.author}
                </h2>
              </div>
              <div className="dropdown dropdown-end">
                <button
                  tabIndex={0}
                  role="button"
                  className="btn btn-ghost btn-xs"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    fill="currentColor"
                    viewBox="0 0 16 16"
                  >
                    <path d="M9.5 13a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0m0-5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0m0-5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0" />
                  </svg>
                </button>
                <ul
                  tabIndex={0}
                  className="dropdown-content menu bg-base-300 rounded-box z-[1] w-32 p=2 shadow"
                >
                  <li>
                    <button
                      onClick={(e) => handleDownload(e, book.id, book.title)}
                    >
                      Download
                    </button>
                  </li>
                  <li>
                    <button
                      onClick={(e) =>
                        openDeleteConfirmation(e, book.id, book.title)
                      }
                    >
                      Delete
                    </button>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        ))}
      </div>
      <dialog
        id="delete_modal"
        className={`modal ${isDeleteModalOpen ? "modal-open" : ""}`}
      >
        <div className="modal-box">
          <h3 className="font-bold text-lg">Confirm Deletion</h3>
          {bookToDelete && (
            <p>
              Are you sure you want to permanently delete{" "}
              <strong>{bookToDelete.title}</strong>?
            </p>
          )}
          <div className="modal-action">
            <button className="btn btn-ghost" onClick={handleCancelDelete}>
              Cancel
            </button>
            <button className="btn btn-ghost" onClick={handleConfirmDelete}>
              Delete
            </button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button onClick={handleCancelDelete}>Close</button>
        </form>
      </dialog>
    </div>
  );
}

export default Library;
