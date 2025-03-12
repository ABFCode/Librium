interface AuthUtils {
  //getToken: () => string | null;
  isAuthenticated: () => Promise<boolean>;
  logout: () => void;
  //getAuthHeaders: () => HeadersInit;
}

const auth: AuthUtils = {
  //getToken: () => localStorage.getItem("token"),

  //isAuthenticated: () => !!localStorage.getItem("token"),

  logout: async () => {
    await fetch(`${import.meta.env.VITE_API_URL}/user/logout`, {
      method: "POST",
      credentials: "include",
    });
  },

  isAuthenticated: async () => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/user/validate`,
        {
          method: "GET",
          credentials: "include",
        }
      );
      return response.ok;
    } catch (error) {
      console.error("Error checking authentication:", error);
      return false;
    }
  },

  // getAuthHeaders: () => ({
  //   Authorization: `Bearer ${localStorage.getItem("token")}`,
  //   "Content-Type": "application/json",
  // }),
};

export default auth;
