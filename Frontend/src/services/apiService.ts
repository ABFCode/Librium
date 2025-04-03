interface UserCredentials {
  username: string;
  password: string;
}

interface Book {
  id: string;
  title: string;
  author: string;
  lastChapterIndex: number;
  coverImagePath: string | null;
}

interface Chapter {
  title: string;
  anchor: string;
  index: number;
}

interface BookMeta {
  title: string;
  author: string;
  chapters: Chapter[];
}

interface ChapterContent {
  content: string;
}

interface UserBookProgress {
  bookId: number;
  lastChapterIndex: number;
}

interface ApiErrorDetail {
  type: string;
  title: string;
  status: number;
  detail: string;
  timestamp: string;
}

class ApiError extends Error {
  details: ApiErrorDetail;

  constructor(details: ApiErrorDetail) {
    super(details.detail || details.title || "API Error");
    this.name = "ApiError";
    this.details = details;
  }
}

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8080/api";

//Auth

export const apiService = {
  login: async (credentials: UserCredentials): Promise<void> => {
    const response = await fetch(`${API_URL}/user/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify(credentials),
    });

    if (!response.ok) {
      await handleApiError(response);
    }

    return;
  },

  register: async (credentials: UserCredentials): Promise<void> => {
    const response = await fetch(`${API_URL}/user/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify(credentials),
    });
    if (!response.ok) {
      await handleApiError(response);
    }

    //console.log("Registration successful");
    return;
  },

  logout: async (): Promise<void> => {
    const response = await fetch(`${API_URL}/user/logout`, {
      method: "POST",
      credentials: "include",
    });

    if (!response.ok) {
      await handleApiError(response);
    }

    return;
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
  getLibrary: async (): Promise<Book[]> => {
    const response = await fetch(`${API_URL}/library`, {
      method: "GET",
      credentials: "include",
    });

    if (!response.ok) {
      await handleApiError(response);
    }
    return response.json();
  },

  uploadBook: async (file: File): Promise<void> => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch(`${API_URL}/library/upload`, {
      method: "POST",
      credentials: "include",
      body: formData,
    });

    if (!response.ok) {
      await handleApiError(response);
    }
    return;
  },

  getCoverImage: (filename: string): string => {
    const cleanFilename = filename.split("/").pop();
    return `${API_URL}/covers/${cleanFilename}`;
  },

  //Reading
  getBookMeta: async (bookId: string): Promise<BookMeta> => {
    const response = await fetch(`${API_URL}/epub/${bookId}/meta`, {
      credentials: "include",
    });

    if (!response.ok) {
      await handleApiError(response);
    }

    return response.json();
  },

  getChapterContent: async (
    bookId: string,
    chapterIndex: number
  ): Promise<ChapterContent> => {
    const response = await fetch(
      `${API_URL}/epub/${bookId}/chapter/${chapterIndex}`,
      {
        credentials: "include",
      }
    );
    if (!response.ok) {
      await handleApiError(response);
    }

    return response.json();
  },

  //Progress
  saveProgress: async (progressData: UserBookProgress): Promise<void> => {
    const response = await fetch(`${API_URL}/progress/save`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify(progressData),
    });

    if (!response.ok) {
      await handleApiError(response);
    }

    return;
  },

  getProgress: async (bookId: string): Promise<number> => {
    const response = await fetch(`${API_URL}/progress/get?bookId=${bookId}`, {
      credentials: "include",
    });
    if (!response.ok) {
      await handleApiError(response);
    }

    return response.json();
  },
};

const handleApiError = async (response: Response): Promise<never> => {
  let errorDetails: ApiErrorDetail | null = null;
  try {
    const errorData = await response.json();
    if (errorData && errorData.status && errorData.title && errorData.detail) {
      errorDetails = errorData as ApiErrorDetail;
    }
  } catch (error) {
    console.error("Failed to parse error response", error);
  }

  if (errorDetails) {
    throw new ApiError(errorDetails);
  } else {
    throw new Error(`Unknown API Error: ${response.statusText}`);
  }
};

export type {
  UserCredentials,
  Book,
  Chapter,
  BookMeta,
  ChapterContent,
  UserBookProgress,
  ApiErrorDetail,
};

export { ApiError };
