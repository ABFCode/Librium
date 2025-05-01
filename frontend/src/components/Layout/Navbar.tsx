import { ReactNode } from "react";
import { Link } from "react-router-dom";
import ThemeToggle from "../ThemeToggle";

interface NavbarProps {
  startContent?: ReactNode;
  centerContent?: ReactNode;
  endContent?: ReactNode;
}

const Navbar = ({ startContent, centerContent, endContent }: NavbarProps) => {
  return (
    <div className="navbar fixed top-0 z-10 bg-base-100 shadow-md">
      <div className="navbar-start">
        {startContent ? (
          startContent
        ) : (
          <Link to="/" className="btn btn-ghost text-xl normal-case">
            Library
          </Link>
        )}
      </div>
      <div className="navbar-center">{centerContent}</div>
      <div className="navbar-end flex items-center gap-2">
        {endContent}
        <ThemeToggle />
      </div>
    </div>
  );
};

export default Navbar;
