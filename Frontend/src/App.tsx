import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
//import "./App.css";
import Library from "./components/Library/Library";
import SignIn from "./components/SignIn";
import Reader from "./components/Reader/Reader";

function App() {
  // const [books, setBooks] = useState<Book[]>([]);
  // useEffect(() => {
  //   loadBooks();
  // }, []);
  // const loadBooks = async (): Promise<void> => {
  //   try {
  //     const response = await fetch("http://localhost:8080/library");
  //     const data: Book[] = await response.json();
  //     setBooks(data);
  //     console.log(data);
  //   } catch (e: unknown) {
  //     if (e instanceof Error) {
  //       console.error("Error fetching default books", e);
  //     }
  //   }
  // };
  // return (
  //   <Router>
  //     <>
  //       <div>
  //         <ul className="cards">
  //           {books.map((book) => (
  //             <li key={book.id}>
  //               <a href={`/`} className="card">
  //                 <img src={"book.jpg"} style={{ width: "100%" }} />
  //                 <div className="container">
  //                   <h4>{book.title}</h4>
  //                   <p>{book.author}</p>
  //                 </div>
  //               </a>
  //             </li>
  //           ))}
  //         </ul>
  //       </div>
  //     </>
  //   </Router>
  // );

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Library />}></Route>
        <Route path="/signin" element={<SignIn />}></Route>
        <Route path="/epub/:bookId" element={<Reader />}></Route>
      </Routes>
    </Router>
  );
}

export default App;
