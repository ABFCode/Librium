import { useState } from "react";
import "./App.css";

function App() {
  const [chapterContent, setChapterContent] = useState("");
  const [chapterIndex, setChapterIndex] = useState(null);

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

  function loadBook() {
    console.log("Pressed LoadBook");
    if (chapterIndex === null) {
      loadChapter(0);
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

  return (
    <div>
      {chapterIndex === null ? (
        <button onClick={loadBook}>Load the Book!</button>
      ) : chapterContent ? (
        <div>
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
