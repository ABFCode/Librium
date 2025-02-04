import { useState } from "react";
import "./App.css";

function App() {
  const [message, setMessage] = useState("");

  const fetchHello = async () => {
    try {
      const response = await fetch("http://localhost:8080/hello");
      if (!response.ok) {
        throw new Error("Not ok");
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
      <button onClick={fetchHello}>Fetch hello</button>
      <p>Response: {message}</p>
    </div>
  );
}

export default App;
