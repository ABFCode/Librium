import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import auth from "../../utility/auth";
import ThemeToggle from "../ThemeToggle";
import {
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

  const navigate = useNavigate();

  useEffect(() => {
    if (!auth.isAuthenticated()) {
      navigate("/signin");
      return;
    }

    const initializeReader = async () => {
      if (!bookId) {
        return;
      }
      try {
        const [metaResponse, progressResponse] = await Promise.all([
          apiService.getBookMeta(bookId),
          apiService.getProgress(bookId),
        ]);
        console.log("API Responses:", { metaResponse, progressResponse });

        if (metaResponse && typeof progressResponse === "number") {
          setMeta(metaResponse);
          setFlattenedToc(metaResponse.chapters);
          setCurrentChapterIndex(progressResponse);
        }
      } catch (error) {
        console.error("Error during reader init", error);
      }
    };

    initializeReader();
  }, [bookId, navigate]);

  const loadChapter = useCallback(
    async (index: number) => {
      if (!flattenedToc || index < 0 || index >= flattenedToc.length) return;

      const chapterIndex = flattenedToc[index].index;
      if (isNaN(chapterIndex)) {
        console.error("Invalid chapter index", chapterIndex);
        return;
      }

      if (!bookId) {
        console.error("Book ID is not defined");
        return;
      }

      const chapterContent = await apiService.getChapterContent(
        bookId,
        chapterIndex
      );
      console.log(chapterContent);
      setChapterContent(chapterContent.content);

      // try {
      //   const response = await fetch(
      //     `${API_URL}/epub/${bookId}/chapter/${chapterIndex}`,
      //     { credentials: "include" }
      //   );

      //   if (response.status === 401 || response.status === 403) {
      //     auth.logout();
      //     navigate("/signin");
      //     return;
      //   }

      //   const data: ChapterContent = await response.json();
      //   setChapterContent(data.content);
      // } catch (error) {
      //   console.error("Error fetching chapter", error);
      // }
    },
    [bookId, flattenedToc]
  );

  useEffect(() => {
    if (flattenedToc.length > 0 && currentChapterIndex !== null) {
      loadChapter(currentChapterIndex);
    }
  }, [currentChapterIndex, flattenedToc, loadChapter]);

  const saveProgress = useCallback(
    async (chapterIndex: number) => {
      //console.log(`Saving progress at ${chapterIndex}`);
      if (!bookId) {
        console.error("Book ID is not defined");
        return;
      }
      const bookIdNumber = parseInt(bookId);
      const progressData: UserBookProgress = {
        bookId: bookIdNumber,
        lastChapterIndex: chapterIndex,
      };
      await apiService.saveProgress(progressData);
    },
    [bookId]
  );

  const handleChapterSelect = (index: number) => {
    setCurrentChapterIndex(index);
    saveProgress(index);
    setIsTocOpen(false);
  };

  const handleNext = useCallback(() => {
    if (currentChapterIndex != null) {
      if (currentChapterIndex < flattenedToc.length - 1) {
        const nextIndex = currentChapterIndex + 1;
        setCurrentChapterIndex(nextIndex);
        saveProgress(nextIndex);
      }
    }
  }, [currentChapterIndex, flattenedToc.length, saveProgress]);

  const handlePrev = useCallback(() => {
    if (currentChapterIndex != null) {
      if (currentChapterIndex > 0) {
        const prevIndex = currentChapterIndex - 1;
        setCurrentChapterIndex(prevIndex);
        saveProgress(prevIndex);
      }
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
          className="btn btn-primary fixed left-1/12 top-1/2 transform z-10"
        >
          Prev
        </button>
        <button
          onClick={handleNext}
          disabled={currentChapterIndex === flattenedToc.length - 1}
          className="btn btn-primary fixed right-1/12 top-1/2 transform z-10"
        >
          Next
        </button>

        <main className="bg-base-100 w-full max-w-4xl p-8 overflow-y-auto leading-relaxed text-lg z-5 relative">
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
