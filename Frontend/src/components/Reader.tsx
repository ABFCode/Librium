import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

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

  useEffect(() => {
    loadChapter();
  }, []);

  const loadMeta = async () => {
    const reponse = await fetch(`http://localhost:8080/epub/${bookId}/meta`);
    const data: Meta = await reponse.json();
    setMeta(data);
    setToc(data.toc);
  };

  const loadChapter = async () => {
    const response = await fetch(
      `http://localhost:8080/epub/${bookId}/chapter/${index}`
    );
    const data: ChapterContent = await response.json();
    setChapterContent(data.chapterContent);
  };

  return (
    <>
      <Link to={"/"}>
        <button>Go to Library</button>
      </Link>
      <button onClick={loadChapter}>Load Chapter {chapterContent}</button>
      <button onClick={loadMeta}>Load Title {meta?.title}</button>
    </>
  );
}

export default Reader;
