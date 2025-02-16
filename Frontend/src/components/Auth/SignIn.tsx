import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "./Auth.css";

interface LoginCredentials {
  username: string;
  password: string;
}

interface AuthResponse {
  token: string;
  status: string;
}

function SignIn() {
  const navigate = useNavigate();
  const [credentials, setCredentials] = useState<LoginCredentials>({
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
      const response = await fetch("http://localhost:8080/api/user/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(credentials),
      });

      if (!response.ok) {
        throw new Error("Invalid credentials");
      }

      // const rawResponse = await response.text();
      // console.log(rawResponse);

      const data: AuthResponse = await response.json();
      console.log(data);

      localStorage.setItem("token", data.token);
      if (data.status === "SUCCESS") {
        navigate("/");
      } else {
        setError("Login failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    }
  };

  return (
    <div className="auth-container">
      <form onSubmit={handleSubmit} className="auth-form">
        <h1>Sign In</h1>
        {error && <div className="error-message">{error}</div>}
        <div className="form-group">
          <label htmlFor="username">Username</label>
          <input
            type="text"
            id="username"
            name="username"
            value={credentials.username}
            onChange={handleChange}
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="password">Password</label>
          <input
            type="password"
            id="password"
            name="password"
            value={credentials.password}
            onChange={handleChange}
            required
          />
        </div>
        <button type="submit">Sign In</button>
        <p className="auth-link">
          <Link to="/register">Register here</Link>
        </p>
      </form>
    </div>
  );
}

export default SignIn;
