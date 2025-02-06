import { useState } from "react";
import "./App.css";

function App() {
  const [message, setMessage] = useState("");

  const fetchEpub = async () => {
    try {
      const response = await fetch("http://localhost:8080/epub");
      if (!response.ok) {
        throw new Error("not ok");
      }
      const text = await response.text();
      setMessage(text);
    } catch (error) {
      console.error("Error fetching", error);
      setMessage("Error fetching data");
    }
  };

  return (
    <div className="App">
      <h1>Test</h1>
      <button onClick={fetchEpub}>Load a Chapter</button>
      <div>{message}</div>
    </div>
  );
}

export default App;
