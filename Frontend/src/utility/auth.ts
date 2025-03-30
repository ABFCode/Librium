import { apiService } from "../services/apiService";

interface AuthUtils {
  //getToken: () => string | null;
  isAuthenticated: () => Promise<boolean>;
  logout: () => void;
  //getAuthHeaders: () => HeadersInit;
}

const auth: AuthUtils = {
  logout: async () => {
    await apiService.logout();
  },

  isAuthenticated: async () => {
    const response = await apiService.validateSession();
    return response;
  },

  // getAuthHeaders: () => ({
  //   Authorization: `Bearer ${localStorage.getItem("token")}`,
  //   "Content-Type": "application/json",
  // }),
};

export default auth;
