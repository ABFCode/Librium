import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import auth from "../../utility/auth";
import {
  ApiError,
  apiService,
  BookMeta,
  Chapter,
  UserBookProgress,
} from "../../services/apiService";
import ErrorAlert from "../UI/ErrorAlert";
import Navbar from "../Layout/Navbar";

function Reader() {
  const navigate = useNavigate();
  const { bookId, chapterIndex: chapterIndexStr } = useParams<{
    bookId: string;
    chapterIndex: string;
  }>();

  const [meta, setMeta] = useState<BookMeta | null>(null);
  const [flattenedToc, setFlattenedToc] = useState<Chapter[]>([]);
  const [currentChapterIndex, setCurrentChapterIndex] = useState<number | null>(
    null
  );
  const [chapterContent, setChapterContent] = useState<string>("");
  const [isTocOpen, setIsTocOpen] = useState(false);
  const [error, setError] = useState<string>("");

  const mainContentRef = useRef<HTMLElement>(null);

  const fetchBookMeta = useCallback(async () => {
    if (!bookId) {
      setError("BookId is missing");
      return;
    }
    setError("");
    setMeta(null);
    setFlattenedToc([]);
    setCurrentChapterIndex(null);
    setChapterContent("");

    try {
      const metaResponse = await apiService.getBookMeta(bookId);
      setMeta(metaResponse);
      setFlattenedToc(metaResponse.chapters || []);
    } catch (error) {
      console.error("Error fetching boom metadata:", error);
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
    fetchBookMeta();
  }, [fetchBookMeta]);

  const fetchChapterContent = useCallback(
    async (index: number) => {
      if (
        !flattenedToc ||
        !bookId ||
        index < 0 ||
        index >= flattenedToc.length
      ) {
        setError("Invalid state for loading chapter content.");
        return;
      }

      const chapter = flattenedToc[index];
      if (isNaN(chapter.index)) {
        console.error("Invalid chapter index in TOC", chapter);
        setError("Invalid chapter data");
        return;
      }

      setError("");
      setChapterContent("");

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
    if (
      flattenedToc.length > 0 &&
      chapterIndexStr !== null &&
      chapterIndexStr !== undefined
    ) {
      const parsedIndex = parseInt(chapterIndexStr, 10);

      if (
        !isNaN(parsedIndex) &&
        parsedIndex >= 0 &&
        parsedIndex < flattenedToc.length
      ) {
        setCurrentChapterIndex(parsedIndex);
        fetchChapterContent(parsedIndex);
      } else {
        setError(
          `Invalid chapter index in URL: ${chapterIndexStr}. Max is ${
            flattenedToc.length - 1
          }`
        );
        setCurrentChapterIndex(null);
        setChapterContent("");
      }
    }
  }, [chapterIndexStr, flattenedToc, fetchChapterContent]);

  useEffect(() => {
    if (mainContentRef.current) {
      mainContentRef.current.scrollTop = 0;
    }
  }, [chapterContent]);

  const saveProgress = useCallback(
    async (chapterIndexToSave: number) => {
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

      try {
        await apiService.saveProgress(progressData);
      } catch (error) {
        console.error("Error saving progress", error);
        if (error instanceof ApiError) {
          if (error.details.status === 401 || error.details.status === 403) {
            console.error("Unauthorized, returning to sign-in");
            auth.handleUnauthorized(navigate);
          } else {
            console.warn(
              `Failed to save progress: ${
                error.details.detail || error.details.title || "Server error"
              }`
            );
          }
        } else if (error instanceof Error) {
          console.warn(`Failed to save progress: ${error.message}`);
        } else {
          console.warn(
            `A very unexpected error has occured while saving progress`
          );
        }
      }
    },
    [bookId, navigate, flattenedToc]
  );

  const navigateToChapter = useCallback(
    (index: number) => {
      if (
        !bookId ||
        index < 0 ||
        index >= flattenedToc.length ||
        index === currentChapterIndex
      ) {
        setIsTocOpen(false);
        return;
      }
      saveProgress(index);
      navigate(`/epub/${bookId}/${index}`);
      setIsTocOpen(false);
    },
    [bookId, navigate, flattenedToc.length, saveProgress, currentChapterIndex]
  );

  const handleChapterSelect = useCallback(
    (index: number) => {
      navigateToChapter(index);
    },
    [navigateToChapter]
  );

  const handleNext = useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (
        currentChapterIndex !== null &&
        currentChapterIndex < flattenedToc.length - 1
      ) {
        navigateToChapter(currentChapterIndex + 1);
      }
    },
    [currentChapterIndex, flattenedToc.length, navigateToChapter]
  );

  const handlePrev = useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (currentChapterIndex !== null && currentChapterIndex > 0) {
        navigateToChapter(currentChapterIndex - 1);
      }
    },
    [currentChapterIndex, navigateToChapter]
  );

  const handleToggleToc = () => {
    setIsTocOpen(!isTocOpen);
    setError("");
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
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
  }, [handleNext, handlePrev]);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-base-200">
      <Navbar
        centerContent={
          meta && (
            <div className="text-center">
              <h1 className="text-lg font-medium truncate max-w-xs sm:max-w-sm md:max-w-md">
                {meta.title}
              </h1>
              <h2 className="text-sm text-base-content/70 truncate max-w-xs sm:max-w-sm md:max-w-md">
                {meta.author}
              </h2>
            </div>
          )
        }
        endContent={
          <button className="btn btn-ghost" onClick={handleToggleToc}>
            Contents
          </button>
        }
      />

      <ErrorAlert message={error} />

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
          onClick={(e) => handlePrev(e)}
          disabled={currentChapterIndex === 0}
          className="btn btn-primary hidden md:block fixed left-1/12 top-1/2 transform z-10"
        >
          Prev
        </button>
        <button
          onClick={(e) => handleNext(e)}
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
