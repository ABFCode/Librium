import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import "./Reader.css";
import auth from "../../utility/auth";

interface Chapter {
  chapterTitle: string;
  anchor: string;
  filePath: string;
  index: string;
}

interface Meta {
  title: string;
  author: string;
  flatToc: Chapter[];
}

interface ChapterContent {
  chapterContent: string;
}

function Reader() {
  const { bookId } = useParams<{ bookId: string }>();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [flattenedToc, setFlattenedToc] = useState<Chapter[]>([]);
  const [currentChapterIndex, setCurrentChapterIndex] = useState<number | null>(
    null
  );
  const [chapterContent, setChapterContent] = useState<string>("");
  const [isTocOpen, setIsTocOpen] = useState(false);

  const navigate = useNavigate();
  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8080";

  useEffect(() => {
    if (!auth.isAuthenticated()) {
      navigate("/signin");
      return;
    }

    const initializeReader = async () => {
      try {
        const [metaResponse, progressResponse] = await Promise.all([
          fetch(`${API_URL}/epub/${bookId}/meta`, {
            headers: auth.getAuthHeaders(),
          }),
          fetch(`${API_URL}/progress/get?bookId=${bookId}`, {
            headers: auth.getAuthHeaders(),
          }),
        ]);

        if (metaResponse.ok && progressResponse.ok) {
          const metaDeta = await metaResponse.json();
          const progressData = await progressResponse.json();

          setMeta(metaDeta);
          setFlattenedToc(metaDeta.flatToc);
          setCurrentChapterIndex(progressData);
        }
      } catch (error) {
        console.error("Error during reader init", error);
      }
    };

    initializeReader();
  }, [bookId, navigate, API_URL]);

  useEffect(() => {
    if (flattenedToc.length > 0 && currentChapterIndex !== null) {
      loadChapter(currentChapterIndex);
    }
  }, [currentChapterIndex, flattenedToc]);

  const loadChapter = async (index: number) => {
    if (!flattenedToc || index < 0 || index >= flattenedToc.length) return;

    const chapterIndex = parseInt(flattenedToc[index].index);
    if (isNaN(chapterIndex)) {
      console.error("Invalid chapter index", chapterIndex);
      return;
    }

    try {
      const response = await fetch(
        `${API_URL}/epub/${bookId}/chapter/${chapterIndex}`,
        { headers: auth.getAuthHeaders() }
      );

      if (response.status === 401 || response.status === 403) {
        auth.logout();
        navigate("/signin");
        return;
      }

      const data: ChapterContent = await response.json();
      setChapterContent(data.chapterContent);
    } catch (error) {
      console.error("Error fetching chapter", error);
    }
  };

  const saveProgress = async (chapterIndex: number) => {
    //console.log(`Saving progress at ${chapterIndex}`);
    try {
      await fetch(`${API_URL}/progress/save`, {
        method: "POST",
        headers: {
          ...auth.getAuthHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          bookId: bookId,
          lastChapterIndex: chapterIndex,
        }),
      });
      console.log(`Progress saved at chapter ${chapterIndex}`);
    } catch (error) {
      console.error("Error saving book progress", error);
    }
  };

  const handleChapterSelect = (index: number) => {
    setCurrentChapterIndex(index);
    saveProgress(index);
    setIsTocOpen(false);
  };

  const handleNext = () => {
    if (currentChapterIndex != null) {
      if (currentChapterIndex < flattenedToc.length - 1) {
        const nextIndex = currentChapterIndex + 1;
        setCurrentChapterIndex(nextIndex);
        saveProgress(nextIndex);
      }
    }
  };

  const handlePrev = () => {
    if (currentChapterIndex != null) {
      if (currentChapterIndex > 0) {
        const prevIndex = currentChapterIndex - 1;
        setCurrentChapterIndex(prevIndex);
        saveProgress(prevIndex);
      }
    }
  };

  return (
    <div className="reader-layout">
      <nav className="top-nav">
        <div className="nav-left">
          <Link to="/" className="nav-button">
            Library
          </Link>
        </div>
        <div className="nav-center">
          <h1>{meta?.title}</h1>
          <h2>{meta?.author}</h2>
        </div>
        <div className="nav-right">
          <button
            className="nav-button"
            onClick={() => setIsTocOpen(!isTocOpen)}
          >
            Contents
          </button>
        </div>
      </nav>

      <div className="content-wrapper">
        <div className="prev-next">
          <button onClick={handlePrev} disabled={currentChapterIndex === 0}>
            Prev
          </button>
          <button
            onClick={handleNext}
            disabled={currentChapterIndex === flattenedToc.length - 1}
          >
            Next
          </button>
        </div>
        <main className="main-content">
          {chapterContent.split("\n\n").map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </main>

        <aside className={`sidebar right ${isTocOpen ? "open" : ""}`}>
          <div className="toc-content">
            <h3>Table of Contents</h3>
            {flattenedToc.map((chapter, idx) => (
              <button
                key={chapter.index}
                onClick={() => handleChapterSelect(idx)}
                className={`toc-item ${
                  currentChapterIndex === idx ? "active" : ""
                }`}
              >
                {chapter.chapterTitle}
              </button>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

export default Reader;
