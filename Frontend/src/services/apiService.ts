interface UserCredentials {
  username: string;
  password: string;
}

interface AuthResponse {
  token: string | null;
  status: "SUCCESS" | "FAILURE";
}

interface BookDTO {
  id: string;
  title: string;
  author: string;
  lastChapterIndex: number;
  coverImagePath: string;
}

interface ChapterDTO {
  title: string;
  anchor: string;
  index: number;
}

interface BookMetaDTO {
  title: string;
  author: string;
  chapters: ChapterDTO[];
}

interface ChapterContentDTO {
  content: string;
}

interface UserBookProgressDTO {
  bookId: number;
  lastChapterIndex: number;
}

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8080/api";

//Auth

export const apiService = {
  login: async (credentials: UserCredentials): Promise<AuthResponse> => {
    const response = await fetch(`${API_URL}/user/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify(credentials),
    });

    if (!response.ok) {
      throw new Error("Login failed");
    }

    return response.json();
  },

  register: async (credentials: UserCredentials): Promise<AuthResponse> => {
    const response = await fetch(`${API_URL}/user/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify(credentials),
    });
    const responseData: AuthResponse = await response.json();
    console.log(responseData);

    if (!response.ok) {
      console.log("Registration failed");
      return responseData;
    }

    console.log("Registration successful");
    return responseData;
  },

  logout: async (): Promise<void> => {
    const response = await fetch(`${API_URL}/user/logout`, {
      method: "POST",
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error("Logout failed");
    }

    return response.json();
  },

  validateSession: async (): Promise<boolean> => {
    try {
      const response = await fetch(`${API_URL}/user/validate`, {
        method: "GET",
        credentials: "include",
      });

      return response.ok;
    } catch (error) {
      console.error("Session validation error", error);
      return false;
    }
  },

  //Library
  getLibrary: async (): Promise<BookDTO[]> => {
    const response = await fetch(`${API_URL}/library`, {
      method: "GET",
      credentials: "include",
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("unauthorized");
      }
      throw new Error(`Failed to fetch library: Status ${response.status}`);
    }
    return response.json();
  },

  uploadBook: async (formData: FormData): Promise<void> => {
    const response = await fetch(`${API_URL}/library/upload`, {
      method: "POST",
      credentials: "include",
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Failed to upload book: Status ${response.status}`);
    }
    return response.json();
  },

  getCoverImage: (filename: string): string => {
    const cleanFilename = filename.split("/").pop();
    return `${API_URL}/covers/${cleanFilename}`;
  },

  //Reading
  getBookMeta: async (bookId: number): Promise<BookMetaDTO> => {
    const response = await fetch(`${API_URL}/epub/${bookId}/meta`, {
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error(`Error retrieving bookMeta: Status ${response.status}`);
    }

    return response.json();
  },

  getChapterContent: async (
    bookId: number,
    chapterIndex: number
  ): Promise<ChapterContentDTO> => {
    const response = await fetch(
      `${API_URL}/epub/${bookId}/chapter/${chapterIndex}`,
      {
        credentials: "include",
      }
    );
    if (!response.ok) {
      throw new Error(
        `Error getting chapter Content: Status ${response.status}`
      );
    }

    return response.json();
  },

  //Progress
  saveProgress: async (
    progressData: UserBookProgressDTO
  ): Promise<UserBookProgressDTO> => {
    const response = await fetch(`${API_URL}/progress/save`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify(progressData),
    });

    if (!response.ok) {
      throw new Error(`Error saving progress: Status: ${response.status}`);
    }

    return response.json();
  },

  getProgress: async (bookId: number): Promise<number> => {
    const response = await fetch(`${API_URL}/progress/get?bookId=${bookId}`, {
      credentials: "include",
    });
    if (!response.ok) {
      throw new Error(`Error getting book progress: Status ${response.status}`);
    }

    return response.json();
  },
};

export type {
  UserCredentials,
  AuthResponse,
  BookDTO,
  ChapterDTO,
  BookMetaDTO,
  ChapterContentDTO,
  UserBookProgressDTO,
};
