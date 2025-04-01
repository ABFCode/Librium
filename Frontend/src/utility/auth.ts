import { ApiError, apiService } from "../services/apiService";
import { NavigateFunction } from "react-router-dom";
interface AuthUtils {
  //getToken: () => string | null;
  isAuthenticated: () => Promise<boolean>;
  logout: () => Promise<void>;
  handleUnauthorized: (navigate: NavigateFunction) => void;
  //getAuthHeaders: () => HeadersInit;
}

const auth: AuthUtils = {
  logout: async () => {
    try {
      await apiService.logout();
      console.log("Logged out");
    } catch (error) {
      console.error("Error logging out", error);
    }
  },

  isAuthenticated: async () => {
    try {
      await apiService.validateSession();
      return true;
    } catch (error) {
      if (error instanceof ApiError) {
        console.error(error.details.detail);
      }
      console.error("Error validating session", error);
      return false;
    }
  },

  handleUnauthorized: (navigate) => {
    console.warn("Unauthorized access");
    auth.logout().finally(() => {
      navigate("/signin");
    });
  },

  // getAuthHeaders: () => ({
  //   Authorization: `Bearer ${localStorage.getItem("token")}`,
  //   "Content-Type": "application/json",
  // }),
};

export default auth;
