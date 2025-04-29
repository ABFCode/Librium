import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
//import "./App.css";
import Library from "./components/Library/Library";
import SignIn from "./components/Auth/SignIn";
import Reader from "./components/Reader/Reader";
import Register from "./components/Auth/Register";
import ProtectedRoute from "./components/Auth/ProtectedRoute";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/signin" element={<SignIn />} />
        <Route path="/register" element={<Register />} />

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Library />
            </ProtectedRoute>
          }
        />
        <Route
          path="/epub/:bookId/:chapterIndex"
          element={
            <ProtectedRoute>
              <Reader />
            </ProtectedRoute>
          }
        />
      </Routes>
    </Router>
  );
}

export default App;
