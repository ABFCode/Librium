import { useEffect, useState } from "react";
import auth from "../../utility/auth";
import { Link } from "react-router-dom";

const NotFound = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        setLoading(true);
        const status = await auth.isAuthenticated();
        setIsAuthenticated(status);
      } catch (error) {
        console.error("Error checking auth status", error);
        setIsAuthenticated(false);
      } finally {
        setLoading(false);
      }
    };
    checkAuthStatus();
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-base-200 p-4 text-center">
      <h1 className="mb-4 text-4xl font-bold text-error sm:text-5xl">
        404 - Not Found
      </h1>
      <p className="mb-8 text-lg text-base-content">
        The page you're looking for doesn't seem to exist or may have been
        moved.
      </p>
      {loading ? (
        <span className="loading loading-spinner loading-lg"></span>
      ) : isAuthenticated ? (
        <Link to="/" className="btn btn-primary">
          Go to your Library
        </Link>
      ) : (
        <Link to="/signin" className="btn btn-primary">
          Go to Sign In
        </Link>
      )}
    </div>
  );
};

export default NotFound;
