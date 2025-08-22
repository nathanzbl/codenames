import { useEffect, useMemo, useState } from "react";

export default function SpymasterPage() {
  const params = useMemo(
    () => new URLSearchParams(typeof window !== "undefined" ? window.location.search : ""),
    []
  );
  const id = params.get("id");
  const team = params.get("team") === "blue" ? "blue" : "red";

  const [words, setWords] = useState([]);
  const [types, setTypes] = useState([]);

  useEffect(() => {
    (async () => {
      if (!id) return;
      const res = await fetch(`/game/${id}/spymaster/${team}`);
      if (!res.ok) {
        console.error("Spymaster fetch failed", res.status);
        return;
      }
      const data = await res.json();
      setWords(data.words);
      setTypes(data.types);
    })();
  }, [id, team]);

  const color = (t) =>
    t === "blue"
      ? "bg-blue-600 text-white"
      : t === "red"
      ? "bg-red-600 text-white"
      : t === "assassin"
      ? "bg-black text-white"
      : "bg-gray-300 text-gray-800";

  if (!id) return <p className="p-4">Missing game id.</p>;
  if (words.length !== 25 || types.length !== 25) return <p className="p-4">Loading…</p>;

  return (
    <div className="min-h-screen p-4 flex flex-col items-center gap-4">
      <h2 className="text-xl font-semibold capitalize">{team} spymaster</h2>

      <div className="flex gap-3 text-sm">
        <span className="px-2 py-1 rounded bg-blue-600 text-white">Blue</span>
        <span className="px-2 py-1 rounded bg-red-600 text-white">Red</span>
        <span className="px-2 py-1 rounded bg-gray-300 text-gray-800">Neutral</span>
        <span className="px-2 py-1 rounded bg-black text-white">Assassin</span>
      </div>

      <div className="grid grid-cols-5 gap-2 w-full max-w-2xl">
        {words.map((w, i) => (
          <div
            key={i}
            className={`h-16 sm:h-20 rounded flex items-center justify-center font-bold uppercase ${color(types[i])}`}
          >
            {w}
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-600 mt-2">
        Opponent cards are masked as neutral on this view.
      </p>
    </div>
  );
}
