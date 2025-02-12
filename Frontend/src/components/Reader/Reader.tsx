import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Library from "../Library/Library";
import "./Reader.css";

interface Meta {
  title: string;
  author: string;
  toc: { title: string; index: number }[];
}

interface ChapterContent {
  chapterContent: string;
}

function Reader() {
  const { bookId } = useParams<{ bookId: string }>();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [toc, setToc] = useState<{ title: string; index: number }[]>();
  const [index, setIndex] = useState<number>(0);
  const [chapterContent, setChapterContent] = useState<string | "">("");
  const [isTocOpen, setIsTocOpen] = useState(false);

  useEffect(() => {
    loadMeta();
  }, [bookId]);

  useEffect(() => {
    if (meta?.toc && meta.toc.length > 0) {
      loadChapter(meta.toc[0].index);
    }
  }, [meta]);

  const loadMeta = async () => {
    const reponse = await fetch(`http://localhost:8080/epub/${bookId}/meta`);
    const data: Meta = await reponse.json();
    setMeta(data);
    setToc(data.toc);
  };

  const loadChapter = async (index: number) => {
    const response = await fetch(
      `http://localhost:8080/epub/${bookId}/chapter/${index}`
    );
    const data: ChapterContent = await response.json();
    setChapterContent(data.chapterContent);
  };

  const handleChapterSelect = (index: number) => {
    loadChapter(index);
    setIndex(index);
    setIsTocOpen(false);
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
