import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

// Initialize theme from localStorage or default to dark
const savedTheme = localStorage.getItem("theme") as "dark" | "cupcake" | null;
if (savedTheme && (savedTheme === "dark" || savedTheme === "cupcake")) {
  document.documentElement.setAttribute("data-theme", savedTheme);
} else {
  localStorage.setItem("theme", "dark");
  document.documentElement.setAttribute("data-theme", "dark");
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
