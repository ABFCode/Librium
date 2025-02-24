import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import "./Reader.css";
import auth from "../../utility/auth";

interface Chapter {
  title: string;
  anchor: string;
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
  const [toc, setToc] = useState<{ title: string; index: number }[]>();
  const [currentChapterIndex, setCurrentChapterIndex] = useState<number>(0);
  const [chapterContent, setChapterContent] = useState<string | "">("");
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
    loadMeta();
  }, [bookId]);

  useEffect(() => {
    if (meta?.toc && meta.toc.length > 0) {
      setCurrentChapterIndex(0);
    }
  }, [meta]);

  useEffect(() => {
    if (meta?.toc && meta.toc.length > 0) {
      loadChapter(currentChapterIndex);
    }
  }, [currentChapterIndex, meta]);

  const loadMeta = async () => {
    try {
      const reponse = await fetch(`http://localhost:8080/epub/${bookId}/meta`, {
        headers: auth.getAuthHeaders(),
      });

      if (reponse.status === 401 || reponse.status === 403) {
        auth.logout();
        return;
      }

      const data: Meta = await reponse.json();
      setMeta(data);
      setToc(data.toc);
    } catch (error) {
      console.error("Error fetching meta", error);
    }
  };

  const loadChapter = async (index: number) => {
    if (!meta || !meta.toc[index] || !toc) return;

    const chapterIndex = toc[index].index;

    try {
      const response = await fetch(
        `http://localhost:8080/epub/${bookId}/chapter/${chapterIndex}`,
        { headers: auth.getAuthHeaders() }
      );

      if (response.status === 401 || response.status === 403) {
        auth.logout();
        return;
      }
      const data: ChapterContent = await response.json();
      console.log(data);
      setChapterContent(data.chapterContent);
    } catch (error) {
      console.error("Error fetching chapter", error);
    }
  };

  const handleChapterSelect = (index: number) => {
    setCurrentChapterIndex(index);
    console.log("CurrentChapterIndex: ", index);
    // loadChapter(index);
    setIsTocOpen(false);
  };

  const handleNext = () => {
    if (!meta?.toc) return;

    if (currentChapterIndex < meta.toc.length - 1) {
      console.log("CurrentChapterIndex: ", currentChapterIndex);
      setCurrentChapterIndex(currentChapterIndex + 1);
      console.log("CurrentChapterIndex: ", currentChapterIndex);
    }

    // console.log("Inside Next");
    // if (!toc) return;
    // const currentIndex = toc.findIndex(
    //   (chapter) => chapter.index === currentChapterIndex
    // );
    // console.log(toc);
    // console.log(currentIndex);
    // console.log(currentChapterIndex);
    // if (currentChapterIndex < toc.length - 1) {
    //   const nextIndex = toc[currentIndex + 1].index;
    //   loadChapter(nextIndex);
    //   setCurrentChapterIndex(nextIndex);
    // }
  };

  const handlePrev = () => {
    if (!meta?.toc) return;

    if (currentChapterIndex > 0) {
      console.log("CurrentChapterIndex: ", currentChapterIndex);
      setCurrentChapterIndex(currentChapterIndex - 1);
      console.log("CurrentChapterIndex: ", currentChapterIndex);
    }

    // if (!toc) return;
    // const currentIndex = toc.findIndex(
    //   (chapter) => chapter.index === currentChapterIndex
    // );
    // if (currentIndex > 0) {
    //   const prevIndex = toc[currentIndex - 1].index;
    //   loadChapter(prevIndex);
    //   setCurrentChapterIndex(prevIndex);
    // }
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
          <button
            onClick={handlePrev}
            disabled={
              !toc ||
              toc.findIndex(
                (chapter) => chapter.index === currentChapterIndex
              ) === 0
            }
          >
            Prev
          </button>
          <button
            onClick={handleNext}
            disabled={
              !toc ||
              toc.findIndex(
                (chapter) => chapter.index === currentChapterIndex
              ) ===
                toc.length - 1
            }
          >
            Next
          </button>
        </div>
        <main className="main-content">{chapterContent}</main>

        <aside className={`sidebar right ${isTocOpen ? "open" : ""}`}>
          <div className="toc-content">
            <h3>Table of Contents</h3>
            {toc?.map((chapter) => (
              <button
                key={chapter.index}
                onClick={() => handleChapterSelect(chapter.index)}
                className="toc-item"
              >
                {chapter.title}
              </button>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

export default Reader;
