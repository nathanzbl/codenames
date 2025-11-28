import { useState } from "react";
import Button from "./Button";

export default function Auth({ onLogin }) {
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    const endpoint = isRegister ? "/auth/register" : "/auth/login";

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Authentication failed");
      }

      onLogin(data); 
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-6 p-4">
      <h2 className="text-2xl font-bold text-gray-800">
        {isRegister ? "Create Account" : "Login"}
      </h2>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full max-w-sm">
        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          required
        />

        {error && <p className="text-red-500 text-sm text-center">{error}</p>}

        <Button className="justify-center bg-indigo-600">
          {isRegister ? "Sign Up" : "Log In"}
        </Button>
      </form>

      {/* CHANGED FROM <p> TO <div> TO PREVQNT HYDRATION ERROR */}
      <div className="text-gray-600 text-sm">
        {isRegister ? "Already have an account?" : "Need an account?"}{" "}
        <button
          onClick={() => setIsRegister(!isRegister)}
          className="text-indigo-600 font-semibold hover:underline"
        >
          {isRegister ? "Log In" : "Register"}
        </button>
      </div>
    </div>
  );
}