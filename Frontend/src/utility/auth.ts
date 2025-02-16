export interface AuthUtils {
  getToken: () => string | null;
  isAuthenticated: () => boolean;
  logout: () => void;
  getAuthHeaders: () => HeadersInit;
}

const auth: AuthUtils = {
  getToken: () => localStorage.getItem("token"),

  isAuthenticated: () => !!localStorage.getItem("token"),

  logout: () => {
    localStorage.removeItem("token");
  },

  getAuthHeaders: () => ({
    Authorization: `Bearer ${localStorage.getItem("token")}`,
    "Content-Type": "application/json",
  }),
};

export default auth;
