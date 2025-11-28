import { useState, useEffect } from "react";
import QRCode from "react-qr-code";
import CodenamesBoard from "./CodenamesBoard";
import SpymasterPage from "./SpymasterPage";
import Auth from "./auth";

export default function App() {
  // --- HYDRATION FIX START ---
  // This ensures the app only renders in the browser, 
  // preventing errors from extensions or server mismatches.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null; 
  // --- HYDRATION FIX END ---

  // Detect spymaster view safely
  const params = new URLSearchParams(window.location.search);
  if (params.get("view") === "spymaster") {
    return <SpymasterPage />;
  }

  return <GameContent />;
}

// Split content into a sub-component to keep things clean
function GameContent() {
  const [user, setUser] = useState(null);
  const [gameId, setGameId] = useState(null);
  const [words, setWords] = useState([]);
  const [types, setTypes] = useState([]);

  async function newGame() {
    try {
      const res = await fetch("/game/new", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setGameId(data.id);
      setWords(data.words);
      setTypes(data.types);
    } catch (err) {
      console.error("Failed to create game",XHerr);
    }
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center">
        <h1 className="text-4xl font-bold mb-8 text-gray-800">Codenames</h1>
        <Auth onLogin={(userData) => setUser(userData)} />
      </div>
    );
  }

  const origin = window.location.origin;
  const blueUrl = gameId ? `${origin}/?view=spymaster&id=${gameId}&team=blue` : "";
  const redUrl = gameId ? `${origin}/?view=spymaster&id=${gameId}&team=red` : "";

  return (
    <div className="h-screen bg-gray-100 flex flex-col overflow-hidden">
      <header className="flex items-center justify-between max-w-4xl mx-auto mb-4 w-full p-4">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold">Codenames</h1>
          <span className="text-sm text-gray-600">
            Welcome, {user.username || "Player"}
          </span>
        </div>
        <div className="flex gap-2">
           <button onClick={newGame} className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700">
            New Game
          </button>
          <button onClick={() => setUser(null)} className="px-3 py-2 bg-gray-300 text-gray-800 font-semibold rounded-lg hover:bg-gray-400">
            Logout
          </button>
        </div>
      </header>

      <main className="flex-1 w-full px-4 overflow-y-auto">
        {gameId && (
          <section className="max-w-4xl mx-auto mb-6 flex flex-col sm:flex-row gap-6">
            <div className="text-center">
              <div className="font-semibold mb-1">Blue Spymaster</div>
              <QRCode value={blueUrl} size={128} />
              <div className="text-xs mt-1 break-all">{blueUrl}</div>
            </div>
            <div className="text-center">
              <div className="font-semibold mb-1">Red Spymaster</div>
              <QRCode value={redUrl} size={128} />
              <div className="text-xs mt-1 break-all">{redUrl}</div>
            </div>
          </section>
        )}

        <section className="max-w-4xl mx-auto mb-6">
          <CodenamesBoard words={words} types={types} />
        </section>
      </main>

      <footer className="w-full border-t border-gray-300 py-3 text-center text-xs text-gray-500">
        Codenames clone by Nathan Blatter
      </footer>
    </div>
  );
}