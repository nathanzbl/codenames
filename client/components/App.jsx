// npm i qrcode.react
import { useEffect, useState } from "react";
import QRCode from "react-qr-code";
import CodenamesBoard from "./CodenamesBoard";
import SpymasterPage from "./SpymasterPage";

export default function App() {
  // Detect spymaster view early. No router required.
  const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  if (params.get("view") === "spymaster") {
    return <SpymasterPage />;
  }

  const [gameId, setGameId] = useState(null);
  const [words, setWords] = useState([]);
  const [types, setTypes] = useState([]);

  async function newGame() {
    const res = await fetch("/game/new", { method: "POST" });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    console.log("New game created:", data);
    setGameId(data.id);
    setWords(data.words);
    setTypes(data.types);
   
    
    const typeCounts =  await types.reduce((acc, type) => {
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});
    
    await console.log( await typeCounts);
      


  }



  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const blueUrl = gameId ? `${origin}/?view=spymaster&id=${gameId}&team=blue` : "";
  const redUrl  = gameId ? `${origin}/?view=spymaster&id=${gameId}&team=red`  : "";

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <header className="flex items-center justify-between max-w-4xl mx-auto mb-4">
        <h1 className="text-2xl font-bold">Codenames</h1>
        <button
          onClick={newGame}
          className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700"
        >
          New Game
        </button>
      </header>

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

      <section className="max-w-4xl mx-auto">
        <CodenamesBoard words={words} types={types} />
      </section>
    </div>
  );
}
