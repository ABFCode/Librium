import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ApiError,
  apiService,
  UserCredentials,
} from "../../services/apiService";

interface RegisterCredentials {
  username: string;
  password: string;
  confirmPassword: string;
}

// interface AuthResponse {
//   token: string;
//   status: string;
// }

function Register() {
  const navigate = useNavigate();
  const [credentials, setCredentials] = useState<RegisterCredentials>({
    username: "",
    password: "",
    confirmPassword: "",
  });
  const [error, setError] = useState<string>("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setCredentials((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (credentials.password !== credentials.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    const userCredentials: UserCredentials = {
      username: credentials.username,
      password: credentials.password,
    };

    try {
      await apiService.register(userCredentials);
      navigate("/signin");
    } catch (error) {
      if (error instanceof ApiError) {
        setError(
          error.details.detail || error.details.title || "Registration failed"
        );
      } else {
        setError("Registration failed");
      }
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-base-200">
      <form
        onSubmit={handleSubmit}
        className="bg-base-300 p-6 rounded-lg shadow-md w-full max-w-md"
      >
        <h1 className="text-5xl font-bold text-center mb-4 text-primary p-3">
          Register
        </h1>
        {error && (
          <div className="alert alert-error shadow-lg mb-4">
            <span>{error}</span>
          </div>
        )}
        <div className="mb-4">
          <label htmlFor="username" className="block text-base-content mb-2">
            Username
          </label>
          <input
            type="text"
            id="username"
            name="username"
            value={credentials.username}
            onChange={handleChange}
            className="input input-bordered w-full"
            required
          />
        </div>
        <div className="mb-4">
          <label htmlFor="password" className="block text-base-content mb-2">
            Password
          </label>
          <input
            type="password"
            id="password"
            name="password"
            value={credentials.password}
            onChange={handleChange}
            className="input input-bordered w-full"
            required
          />
        </div>
        <div className="mb-4">
          <label
            htmlFor="confirmPassword"
            className="block text-base-content mb-2"
          >
            Confirm Password
          </label>
          <input
            type="password"
            id="confirmPassword"
            name="confirmPassword"
            value={credentials.confirmPassword}
            onChange={handleChange}
            className="input input-bordered w-full"
            required
          />
        </div>
        <button type="submit" className="btn btn-primary w-full">
          Register
        </button>
        <p className="text-center text-base-content mt-4">
          Already have an account?{" "}
          <Link to="/signin" className="text-primary hover:underline">
            Sign in here
          </Link>
        </p>
      </form>
    </div>
  );
}

export default Register;
