import { ReactNode, useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import auth from "../../utility/auth";

interface ProtectedRouteProps {
  children: ReactNode;
}

const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const location = useLocation();

  useEffect(() => {
    let isMounted = true;

    const checkAuth = async () => {
      try {
        const isValid = await auth.isAuthenticated();
        if (isMounted) {
          setIsAuthenticated(isValid);
        }
      } catch (error) {
        console.error("Auth check failed in ProtectedRoute", error);
        if (isMounted) {
          setIsAuthenticated(false);
        }
      }
    };

    checkAuth();

    return () => {
      isMounted = false;
    };
  }, [location.key]);

  if (isAuthenticated === null) {
    return <div>Loading....</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/signin" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
