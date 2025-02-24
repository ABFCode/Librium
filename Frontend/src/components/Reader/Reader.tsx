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
  toc: Record<string, Chapter[]>;
}

interface ChapterContent {
  chapterContent: string;
}

function Reader() {
  const { bookId } = useParams<{ bookId: string }>();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [flattenedToc, setFlattenedToc] = useState<Chapter[]>([]);
  const [currentChapterIndex, setCurrentChapterIndex] = useState<number>(0);
  const [chapterContent, setChapterContent] = useState<string>("");
  const [isTocOpen, setIsTocOpen] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    if (!auth.isAuthenticated()) {
      navigate("/signin");
      return;
    }
    loadMeta();
  }, [bookId, navigate]);

  useEffect(() => {
    if (meta?.toc) {
      const flattened: Chapter[] = [];
      Object.values(meta.toc).forEach((chaptersInFile) => {
        chaptersInFile.forEach((chapter) => {
          flattened.push(chapter);
        });
      });

      flattened.sort((a, b) => parseInt(a.index) - parseInt(b.index));
      setFlattenedToc(flattened);

      if (flattened.length > 0) {
        setCurrentChapterIndex(0);
      }
    }
  }, [meta]);

  useEffect(() => {
    if (flattenedToc.length > 0) {
      loadChapter(currentChapterIndex);
    }
  }, [currentChapterIndex, flattenedToc]);

  const loadMeta = async () => {
    try {
      const response = await fetch(
        `http://localhost:8080/epub/${bookId}/meta`,
        {
          headers: auth.getAuthHeaders(),
        }
      );

      if (response.status === 401 || response.status === 403) {
        auth.logout();
        navigate("/signin");
        return;
      }

      const data: Meta = await response.json();
      setMeta(data);
    } catch (error) {
      console.error("Error fetching meta", error);
    }
  };

  const loadChapter = async (index: number) => {
    if (!flattenedToc || index < 0 || index >= flattenedToc.length) return;

    const chapterIndex = parseInt(flattenedToc[index].index);

    try {
      const response = await fetch(
        `http://localhost:8080/epub/${bookId}/chapter/${chapterIndex}`,
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

  const handleChapterSelect = (index: number) => {
    setCurrentChapterIndex(index);
    setIsTocOpen(false);
  };

  const handleNext = () => {
    if (currentChapterIndex < flattenedToc.length - 1) {
      setCurrentChapterIndex(currentChapterIndex + 1);
    }
  };

  const handlePrev = () => {
    if (currentChapterIndex > 0) {
      setCurrentChapterIndex(currentChapterIndex - 1);
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
