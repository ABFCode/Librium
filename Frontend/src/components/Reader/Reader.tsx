import { useEffect, useState, useCallback, useRef } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import auth from "../../utility/auth";
import ThemeToggle from "../ThemeToggle";
import {
  ApiError,
  apiService,
  BookMeta,
  Chapter,
  UserBookProgress,
} from "../../services/apiService";

function Reader() {
  const { bookId } = useParams<{ bookId: string }>();
  const [meta, setMeta] = useState<BookMeta | null>(null);
  const [flattenedToc, setFlattenedToc] = useState<Chapter[]>([]);
  const [currentChapterIndex, setCurrentChapterIndex] = useState<number | null>(
    null
  );
  const [chapterContent, setChapterContent] = useState<string>("");
  const [isTocOpen, setIsTocOpen] = useState(false);
  const [error, setError] = useState<string>("");

  const navigate = useNavigate();

  const mainContentRef = useRef<HTMLElement>(null);

  const initializeReader = useCallback(async () => {
    if (!bookId) {
      setError("BookId is missing");
      return;
    }
    setError("");
    try {
      const [metaResponse, progressResponse] = await Promise.all([
        apiService.getBookMeta(bookId),
        apiService.getProgress(bookId),
      ]);
      //console.log("API Responses: ", {metaResponse, progressResponse});
      if (metaResponse && typeof progressResponse === "number") {
        setMeta(metaResponse);
        setFlattenedToc(metaResponse.chapters);
        setCurrentChapterIndex(progressResponse);
      } else {
        setError("Failed to initialize reader: Data is invalid");
      }
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.details.status === 401 || error.details.status === 403) {
          auth.handleUnauthorized(navigate);
        } else {
          setError(
            `Failed to load book data: ${
              error.details.detail || error.details.title || "Server Error"
            }`
          );
        }
      } else if (error instanceof Error) {
        setError(`Failed to load book data: ${error.message}`);
      } else {
        setError(`A very unexpected error has occured.`);
      }
    }
  }, [bookId, navigate]);

  useEffect(() => {
    const checkAuth = async () => {
      const isAuthenticated = await auth.isAuthenticated();
      if (!isAuthenticated) {
        console.log("Not authenticated on initial check");
        auth.handleUnauthorized(navigate);
        return;
      }
      initializeReader();
    };
    checkAuth();
  }, [navigate, initializeReader]);

  const loadChapter = useCallback(
    async (index: number) => {
      if (!flattenedToc || !bookId || index < 0 || index >= flattenedToc.length)
        return;

      const chapter = flattenedToc[index];
      if (isNaN(chapter.index)) {
        console.error("Invalid chapter index in TOC", chapter);
        setError("Invalid chapter data");
        return;
      }

      setError("");

      try {
        const chapterData = await apiService.getChapterContent(
          bookId,
          chapter.index
        );
        setChapterContent(chapterData.content);
      } catch (error) {
        console.error("Error fetching  chapter content: ", error);
        if (error instanceof ApiError) {
          if (error.details.status === 401 || error.details.status === 403) {
            console.error("Unauthorized, redirectign to sign-in");
            auth.handleUnauthorized(navigate);
          } else {
            setError(
              `Failed to load chapter: ${
                error.details.detail || error.details.title || "Server Error"
              }`
            );
          }
        } else if (error instanceof Error) {
          setError(`Failed to load chapter: ${error.message}`);
        } else {
          setError(`A very unexpected Error has occurred`);
        }
      }
    },
    [bookId, flattenedToc, navigate]
  );

  useEffect(() => {
    if (flattenedToc.length > 0 && currentChapterIndex !== null) {
      loadChapter(currentChapterIndex);
    }
  }, [currentChapterIndex, flattenedToc, loadChapter]);

  useEffect(() => {
    if (mainContentRef.current) {
      mainContentRef.current.scrollTop = 0;
    }
  }, [chapterContent]);

  const saveProgress = useCallback(
    async (chapterIndexToSave: number) => {
      //console.log(`Saving progress at ${chapterIndex}`);
      if (!bookId) {
        console.error("Book ID is not defined");
        return;
      }

      if (chapterIndexToSave < 0 || chapterIndexToSave >= flattenedToc.length) {
        console.error(
          "Cannot save progress: Invalid chapter index.",
          chapterIndexToSave
        );
        return;
      }

      const bookIdNumber = parseInt(bookId);
      if (isNaN(bookIdNumber)) {
        console.error("Cannot save progress: Invalid BookID.", bookId);
        return;
      }

      const progressData: UserBookProgress = {
        bookId: bookIdNumber,
        lastChapterIndex: chapterIndexToSave,
      };

      setError("");
      try {
        await apiService.saveProgress(progressData);
      } catch (error) {
        console.error("Error saving progress", error);
        if (error instanceof ApiError) {
          if (error.details.status === 401 || error.details.status === 403) {
            console.error("Unauthorized, returning to sign-in");
            auth.handleUnauthorized(navigate);
          } else {
            setError(
              `Failed to save progress: ${
                error.details.detail || error.details.title || "Server error"
              }`
            );
          }
        } else if (error instanceof Error) {
          setError(`Failed to save progress: ${error.message}`);
        } else {
          setError(`A very unexpected error has occured while saving progress`);
        }
      }
    },
    [bookId, navigate, flattenedToc]
  );

  const handleChapterSelect = (index: number) => {
    if (index !== currentChapterIndex) {
      setCurrentChapterIndex(index);
      saveProgress(index);
    }
    setIsTocOpen(false);
  };

  const handleNext = useCallback(() => {
    if (
      currentChapterIndex != null &&
      currentChapterIndex < flattenedToc.length - 1
    ) {
      const nextIndex = currentChapterIndex + 1;
      setCurrentChapterIndex(nextIndex);
      saveProgress(nextIndex);
    }
  }, [currentChapterIndex, flattenedToc.length, saveProgress]);

  const handlePrev = useCallback(() => {
    if (currentChapterIndex != null && currentChapterIndex > 0) {
      const prevIndex = currentChapterIndex - 1;
      setCurrentChapterIndex(prevIndex);
      saveProgress(prevIndex);
    }
  }, [currentChapterIndex, saveProgress]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        handlePrev();
      } else if (event.key === "ArrowRight") {
        handleNext();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [currentChapterIndex, flattenedToc.length, handleNext, handlePrev]);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-base-200">
      <div className="navbar bg-base-100 shadow-md fixed top-0 z-10">
        <div className="navbar-start">
          <Link to="/" className="btn btn-ghost">
            Library
          </Link>
        </div>
        <div className="navbar-center">
          <div className="text-center">
            <h1 className="text-lg font-medium">{meta?.title}</h1>
            <h2 className="text-sm">{meta?.author}</h2>
          </div>
        </div>
        <div className="navbar-end">
          <ThemeToggle />
          <button
            className="btn btn-ghost"
            onClick={() => setIsTocOpen(!isTocOpen)}
          >
            Contents
          </button>
        </div>
      </div>

      {error && <span className="alert alert-error">Error: {error}</span>}

      <div className="flex justify-center mt-16 h-[calc(100vh-4rem)] relative">
        <div
          onClick={handlePrev}
          className={`fixed left-0 top-16 w-1/4 h-[calc(100vh-4rem)] z-0 cursor-pointer ${
            currentChapterIndex === 0 ? "cursor-not-allowed" : ""
          }`}
        />

        <div
          onClick={handleNext}
          className={`fixed right-0 top-16 w-1/4 h-[calc(100vh-4rem)] z-0 cursor-pointer ${
            currentChapterIndex === flattenedToc.length - 1
              ? "cursor-not-allowed"
              : ""
          }`}
        />

        <button
          onClick={handlePrev}
          disabled={currentChapterIndex === 0}
          className="btn btn-primary hidden md:block fixed left-1/12 top-1/2 transform z-10"
        >
          Prev
        </button>
        <button
          onClick={handleNext}
          disabled={currentChapterIndex === flattenedToc.length - 1}
          className="btn btn-primary hidden md:block fixed right-1/12 top-1/2 transform z-10"
        >
          Next
        </button>

        <main
          ref={mainContentRef}
          className="bg-base-100 w-full max-w-4xl p-8 overflow-y-auto leading-relaxed text-lg z-5 relative"
        >
          {chapterContent.split("\n\n").map((paragraph, index) => (
            <p
              key={index}
              className={
                index > 0 ? "mt-6 indent-8 text-justify" : "mt-6 text-justify"
              }
            >
              {paragraph}
            </p>
          ))}
          <div className="flex justify-between p-4 mt-6 md:hidden">
            <button
              className="btn btn-primary"
              onClick={handlePrev}
              disabled={currentChapterIndex === 0}
            >
              Prev
            </button>
            <button
              className="btn btn-primary"
              onClick={handleNext}
              disabled={currentChapterIndex === flattenedToc.length - 1}
            >
              Next
            </button>
          </div>
        </main>

        <div
          className={`fixed top-16 right-0 bottom-0 w-80 bg-base-100 shadow-lg transition-transform duration-300 overflow-y-auto z-20 ${
            isTocOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="p-5">
            <h3 className="text-xl font-bold mb-4">Table of Contents</h3>
            <div className="flex flex-col gap-1">
              {flattenedToc.map((chapter, idx) => (
                <button
                  key={chapter.index}
                  onClick={() => handleChapterSelect(idx)}
                  className={`text-left py-2 px-4 rounded-lg hover:bg-base-200 ${
                    currentChapterIndex === idx ? "bg-base-300 font-medium" : ""
                  }`}
                >
                  {chapter.title}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Reader;
