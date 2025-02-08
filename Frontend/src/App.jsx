import { useState } from "react";
import "./App.css";

function App() {
  const [chapterContent, setChapterContent] = useState("");
  const [chapterIndex, setChapterIndex] = useState(null);
  const [toc, setToc] = useState([]);
  const [metaData, setMetaData] = useState({});

  const loadChapter = async (index) => {
    console.log("Inside LoadChapter");
    try {
      const response = await fetch(`http://localhost:8080/epub/${index}`);
      const data = await response.json();
      setChapterContent(data.chapterContent);
      setChapterIndex(index);
    } catch (e) {
      console.error("Error fetching EPUB chapter", e);
    }
  };

  const loadMeta = async () => {
    console.log("Inside LoadMeta");
    try {
      const response = await fetch("http://localhost:8080/epub/meta");
      const data = await response.json();

      setToc(data.toc);

      setMetaData({
        title: data.title,
        author: data.author,
      });
      //   console.log(data);
      //   console.log(`Author is: ${data.author}`);
      //   console.log(`Title is: ${data.title}`);
      //   console.log(data.toc[3].title);
    } catch (e) {
      console.error("Error fetching EPUB Metadata", e);
    }
  };

  function loadBook() {
    console.log("Pressed LoadBook");
    if (chapterIndex === null) {
      loadChapter(0);
      loadMeta();
    }
  }

  function nextChapter() {
    console.log("Pressed Next");
    if (chapterIndex !== null) {
      loadChapter(chapterIndex + 1);
    }
  }

  function prevChapter() {
    console.log("Pressed Prev");
    if (chapterIndex > 0) {
      loadChapter(chapterIndex - 1);
    }
  }

  const renderToc = () => {
    return (
      <ul>
        {toc.map((entry, index) => (
          <li key={index}>
            <button onClick={() => loadChapter(index)}>{entry.title}</button>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <div>
      {chapterIndex === null ? (
        <button onClick={loadBook}>Load the Book! </button>
      ) : chapterContent ? (
        <div>
          <header>
            <h1>{metaData.author}</h1>
            <h3>{metaData.title}</h3>
          </header>
          <nav>
            <h4>Table of Contents</h4>
            {renderToc()}
          </nav>
          <div>{chapterContent}</div>
          <button onClick={prevChapter}>Prev</button>
          <button onClick={nextChapter}>Next</button>
        </div>
      ) : (
        <div>
          <p>The end</p>
          <button onClick={prevChapter}>Prev</button>
        </div>
      )}
    </div>
  );
}

export default App;
