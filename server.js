import express from "express";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import "dotenv/config";
import OpenAI from "openai";
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const port = process.env.PORT || 3000;
const apiKey = process.env.OPENAI_API_KEY;

// OpenAI SDK - correct init
const client = new OpenAI({ apiKey });

// In-memory game store for family night
const games = new Map();
const GAME_TTL_MS = 1000 * 60 * 60 * 6; // 6 hours

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generateTypes() {
  const startingTeam = Math.random() < 0.5 ? "blue" : "red"; // gets 9
  const blueCount = startingTeam === "blue" ? 9 : 8;
  const redCount  = startingTeam === "red"  ? 9 : 8;

  const types = [
    ...Array(blueCount).fill("blue"),
    ...Array(redCount).fill("red"),
    ...Array(7).fill("neutral"),
    "assassin",
  ];

  return  shuffle(types)
}

const schema = {
  "type": "object",
  "properties": {
    "words": {
      "type": "array",
      "items": { "type": "string" },
      "minItems": 25,
      "maxItems": 25
    }
  },
  "required": ["words"],
  "additionalProperties": false
}


// Vite middleware for React client
const vite = await createViteServer({
  server: { middlewareMode: true },
  appType: "custom",
});
app.use(vite.middlewares);

// Ephemeral token for Realtime (unchanged)
app.get("/token", async (req, res) => {
  try {
    const response = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-realtime-preview-2025-06-03",
        voice: "verse",
      }),
    });

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error("Token generation error:", error);
    res.status(500).json({ error: "Failed to generate token" });
  }
});

// Legacy words route kept for compatibility - Structured Outputs fixed
app.get("/words", async (req, res) => {
  try {

    const words1 = await client.responses.create({
      // Use a model that actually supports text.format structured outputs
      model: "gpt-4o-mini",
      input:"Return exactly 25 unique, diverse, and surprising one-word entries.Entries must be lowercase ASCII only.Acceptable categories include celebrities, city names, country names, and objects, but avoid repeating from recent outputs. Ensure high variety across categories so no group dominates. Return as JSON with a single key 'words' and an array of 25 words as the value. Output must be all on one line.",
      text: { format: { "type": "json_schema", "name": "codenames_words", "schema": schema}},
      temperature: 1.2,
      
      
    });
    const payload = JSON.parse(words1.output_text)
    res.json(payload);
  } catch (error) {
    console.error("Token generation error:", error);
    res.status(500).json({ error: "Failed to generate token" });
  }
});


// Create a new game: server generates words + types
app.post("/game/new", async (req, res) => {
  try {

    const words1 = await client.responses.create({
      // Use a model that actually supports text.format structured outputs
      model: "gpt-4o-mini",
      input:
        "Return exactly 25 unique and interesting one-word entries that an 12th grader could understand. Lowercase ASCII only. return as a JSON format with a single key 'words' and an array of words as the value. have the output be all on one line",
      text: { format: { "type": "json_schema", "name": "codenames_words", "schema": schema}},
      temperature: 1.5
      
    });
    const payload = JSON.parse(words1.output_text)
    

    
    const words = payload.words;
    const types = generateTypes();

    const id = "g_" + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    const game = { id, words, types, createdAt: Date.now() };
    games.set(id, game);

    res.json(game);
  } catch (err) {
    console.error("new game error:", err);
    res.status(500).json({ error: "Failed to create game" });
  }
});

// Full game key for public board
app.get("/game/:id", (req, res) => {
  const g = games.get(req.params.id);
  if (!g || isExpired(g)) return res.status(404).json({ error: "not found" });
  res.json(g);
});
app.post("/game/:id/hint", async (req, res) => {
  const g = games.get(req.params.id);
  if (!g || isExpired(g)) return res.status(404).json({ error: "not found" });

  const { team, words, types, revealed } = req.body;
  const opponentTeam = team === 'blue' ? 'red' : 'blue';

  const boardState = words.map((word, i) => ({
    word,
    type: types[i],
    revealed: revealed[i],
  }));

  const myWords = boardState.filter(c => c.type === team && !c.revealed).map(c => c.word);
  const opponentWords = boardState.filter(c => c.type === opponentTeam && !c.revealed).map(c => c.word);
  const neutralWords = boardState.filter(c => c.type === 'neutral' && !c.revealed).map(c => c.word);
  const assassinWord = boardState.find(c => c.type === 'assassin' && !c.revealed)?.word;

  const prompt = `
    You are the spymaster for the ${team} team in the game Codenames.
    Your goal is to provide a single-word clue and a number to get your teammates to guess your team's words.

    RULES:
    1. The clue must be a single word.
    2. The clue cannot be any of the words currently on the board (revealed or not).
    3. The number indicates how many of YOUR team's words relate to your clue.

    GAME STATE:
    - Your team's remaining words are: ${myWords.join(", ")}
    - Opponent's remaining words are: ${opponentWords.join(", ")}
    - Neutral words are: ${neutralWords.join(", ")}
    - The assassin word is: ${assassinWord}

    TASK:
    Analyze your words and find a creative link between two or more of them.
    Prioritize clues that cover more words, but BE EXTREMELY CAREFUL to avoid clues that could lead your team to guess the opponent's words, a neutral word, or especially the assassin word. A safe, 2-word clue is better than a risky 4-word clue.

    Return your answer in JSON format.
  `;

  try {
    const hintResponse = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object", schema: hintSchema },
    });
    const hintPayload = JSON.parse(hintResponse.choices[0].message.content);
    res.json(hintPayload);
  } catch (err) {
    console.error("AI hint error:", err);
    res.status(500).json({ error: "Failed to get AI hint" });
  }
});


// Spymaster view - masks opponent as neutral, always shows assassin
app.get("/game/:id/spymaster/:team", (req, res) => {
  const g = games.get(req.params.id);
  if (!g || isExpired(g)) return res.status(404).json({ error: "not found" });

  const team = req.params.team === "blue" ? "blue" : "red";
  const filtered = g.types.map((t) => {
    if (t === "assassin") return "assassin";
    if (t === team) return team;
    return "neutral";
  });

  res.json({ id: g.id, words: g.words, types: filtered, team });
});

// TTL cleanup
setInterval(() => {
  const now = Date.now();
  for (const [id, g] of games.entries()) {
    if (now - g.createdAt > GAME_TTL_MS) games.delete(id);
  }
}, 60_000);

// React SSR
app.use("*", async (req, res, next) => {
  const url = req.originalUrl;
  try {
    const templatePath = path.resolve(__dirname, 'client/index.html');
    const template = await vite.transformIndexHtml(url,fs.readFileSync(templatePath, "utf-8"),);
    const { render } = await vite.ssrLoadModule("./client/entry-server.jsx");
    const appHtml = await render(url);
    const html = template.replace(`<!--ssr-outlet-->`, appHtml?.html);
    res.status(200).set({ "Content-Type": "text/html" }).end(html);
  } catch (e) {
    vite.ssrFixStacktrace(e);
    next(e);
  }
});

app.listen(port, () => {
  console.log(`Express server running on *:${port}`);
});

function isExpired(g) {
  return Date.now() - g.createdAt > GAME_TTL_MS;
}
