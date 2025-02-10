import { useState } from "react";
import { useParams } from "react-router-dom";

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

  const loadMeta = async () => {
    const reponse = await fetch(`http://localhost:8080:/${bookId}/meta`);
    const data: Meta = await reponse.json();
    setMeta(data);
    setToc(data.toc);
  };

  return (
    <>
      <h1>Book Id: {bookId}</h1>
    </>
  );
}

export default Reader;
