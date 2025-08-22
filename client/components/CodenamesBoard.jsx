import { useEffect, useState } from "react";

function Card({ word, type, isRevealed, onReveal }) {
  const base =
    "flex items-center justify-center h-24 sm:h-28 md:h-32 rounded-lg shadow-md transition-all duration-300 ease-in-out transform cursor-pointer select-none";
  const revealed = {
    red: "bg-red-600 text-white shadow-lg scale-105",
    blue: "bg-blue-600 text-white shadow-lg scale-105",
    neutral: "bg-gray-300 text-gray-800 shadow-lg scale-105",
    assassin: "bg-black text-white shadow-2xl scale-105",
  };
  const unrevealed =
    "bg-yellow-100 hover:bg-yellow-200 text-gray-800 border-2 border-yellow-300 hover:scale-105";
  const cls = isRevealed ? `${base} ${revealed[type]}` : `${base} ${unrevealed}`;

  return (
    <div className={cls} onClick={onReveal}>
      <span className="text-sm sm:text-base font-bold uppercase tracking-wider p-2 text-center">
        {word}
      </span>
    </div>
  );
}

export default function CodenamesBoard({ words = [], types = [] }) {
  const [cards, setCards] = useState([]);

  useEffect(() => {
    if (words.length === 25 && types.length === 25) {
      const init = words.map((w, i) => ({
        id: i,
        word: w,
        type: types[i],
        isRevealed: false,
      }));
      setCards(init);
    } else {
      setCards([]); // no game yet
    }
  }, [words, types]);

  const handleReveal = (id) => {
    setCards((prev) =>
      prev.map((c) => (c.id === id ? { ...c, isRevealed: true } : c))
    );
  };

  if (!words.length) {
    return <p className="text-gray-600">Click New Game to start.</p>;
  }

  return (
    <div className="grid grid-cols-5 gap-3 sm:gap-4 w-full max-w-2xl mx-auto">
      {cards.map((card) => (
        <Card
          key={card.id}
          word={card.word}
          type={card.type}
          isRevealed={card.isRevealed}
          onReveal={() => handleReveal(card.id)}
        />
      ))}
    </div>
  );
}
