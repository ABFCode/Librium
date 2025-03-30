import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiService, UserCredentials } from "../../services/apiService";
function SignIn() {
  const navigate = useNavigate();
  const [credentials, setCredentials] = useState<UserCredentials>({
    username: "",
    password: "",
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

    try {
      const response = await apiService.login(credentials);

      if (response.status === "SUCCESS") {
        navigate("/");
      } else {
        setError("Login failed");
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Login failed");
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-base-200">
      <form
        onSubmit={handleSubmit}
        className="bg-base-300 p-6 rounded-lg shadow-md w-full max-w-md"
      >
        <h1 className="text-5xl font-bold text-center mb-4 text-primary p-3">
          Sign In
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
        <button type="submit" className="btn btn-primary w-full">
          Sign In
        </button>
        <p className="text-center text-base-content mt-4">
          Don't have an account?{" "}
          <Link to="/register" className="text-primary hover:underline">
            Register here
          </Link>
        </p>
      </form>
    </div>
  );
}

export default SignIn;
