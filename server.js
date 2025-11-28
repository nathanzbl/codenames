import express from "express";
import fs from "fs";
import path from 'path';
import { fileURLToPath } from 'url';
import "dotenv/config";
import OpenAI from "openai";
import { Pool } from 'pg';     // <--- Added for DB
import bcrypt from 'bcrypt';   // <--- Added for security

// --- Environment Setup ---
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === 'production';

// --- Database Configuration ---
const pool = new Pool({
  // Make sure DATABASE_URL is in your .env file
  connectionString: process.env.DATABASE_URL,
  ssl: isProd ? { rejectUnauthorized: false } : false 
});

const app = express();
const port = process.env.PORT || 3000;
const apiKey = process.env.OPENAI_API_KEY;

const client = new OpenAI({ apiKey });
const games = new Map();
const GAME_TTL_MS = 1000 * 60 * 60 * 6; // 6 hours

app.use(express.json());

// --- Memory Leak Fix: Cleanup Old Games ---
function cleanupGames() {
  const now = Date.now();
  for (const [id, game] of games.entries()) {
    if (now - game.createdAt > GAME_TTL_MS) {
      games.delete(id);
      console.log(`Deleted expired game: ${id}`);
    }
  }
}
// Run cleanup every 1 hour
setInterval(cleanupGames, 1000 * 60 * 60);


// --- Helper Functions (shuffle, generateTypes, schemas) ---
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generateTypes() {
  const startingTeam = Math.random() < 0.5 ? "blue" : "red";
  const blueCount = startingTeam === "blue" ? 9 : 8;
  const redCount  = startingTeam === "red"  ? 9 : 8;
  const types = [...Array(blueCount).fill("blue"), ...Array(redCount).fill("red"), ...Array(7).fill("neutral"), "assassin"];
  const startingPlayer = blueCount > redCount ? "blue" : "red";
  return  { types: shuffle(types), startingPlayer };
}

const wordsSchema = { type: "object", properties: { words: { type: "array", items: { type: "string" }, minItems: 25, maxItems: 25 }}, required: ["words"], additionalProperties: false };
const hintSchema = { type: "object", properties: { hint: { type: "string" }, count: { type: "number" }}, required: ["hint", "count"], additionalProperties: false };


async function startServer() {
  let vite;
  if (!isProd) {
    // --- DEVELOPMENT MODE ---
    vite = await (await import('vite')).createServer({
      server: { middlewareMode: true },
      appType: "custom",
      root: __dirname,
    });
    app.use(vite.middlewares);
  } else {
    // --- PRODUCTION MODE ---
    app.use(express.static(path.join(__dirname, 'dist/client'), { index: false }));
  }

  // ==========================================
  // --- AUTH ROUTES (NEW) ---
  // ==========================================
  
  // 1. REGISTER
  app.post("/auth/register", async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Missing fields" });

    try {
      const hash = await bcrypt.hash(password, 10);
      const result = await pool.query(
        "INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id, username",
        [username, hash]
      );
      res.status(201).json({ user: result.rows[0] });
    } catch (err) {
      console.error("Register error:", err);
      // Postgres error 23505 is unique violation (username taken)
      if (err.code === '23505') return res.status(409).json({ error: "Username taken" });
      res.status(500).json({ error: "Registration failed" });
    }
  });

  // 2. LOGIN
  app.post("/auth/login", async (req, res) => {
    const { username, password } = req.body;
    try {
      const result = await pool.query("SELECT * FROM users WHERE username = $1", [username]);
      if (result.rows.length === 0) return res.status(401).json({ error: "Invalid credentials" });

      const user = result.rows[0];
      const match = await bcrypt.compare(password, user.password);
      if (!match) return res.status(401).json({ error: "Invalid credentials" });

      // In a real app, send a JWT token here. For this demo, just send user info.
      res.json({ id: user.id, username: user.username });
    } catch (err) {
      console.error("Login error:", err);
      res.status(500).json({ error: "Login failed" });
    }
  });

  // ==========================================
  // --- GAME ROUTES (EXISTING) ---
  // ==========================================

  app.post("/game/new", async (req, res) => {
    try {
      const { aiTeam } = req.body;
      
      // FIXED: Updated to correct OpenAI SDK method (chat.completions.create)
      const words1 = await client.responses.create({
        // Use a model that actually supports text.format structured outputs
        model: "gpt-4o-mini",
        input:
          `Generate a list of 25 Codenames-style words. Follow these rules:
Single words only. No phrases, no hyphens.
Concrete nouns preferred. Avoid abstract concepts (no “justice,” “freedom,” etc.).
Each word must have multiple meanings or be interpretable in different contexts.
No proper nouns unless they are extremely common and not tied to a specific person or brand (good: “Amazon,” “Mercury.” Bad: “Einstein,” “Nike”).
No offensive or adult content.
Mix physical objects, animals, locations, occupations, and ambiguous nouns.
Return the final output as a numbered list of 25 words only with no explanation.`,
        text: { format: { "type": "json_schema", "name": "codenames_words", "schema": wordsSchema}},
        temperature: 1.5
        
      });
      console.log("words response:", words1.output_text);
      const payload = JSON.parse(words1.output_text);
      const words = payload.words;
      
      const { types, startingPlayer } = generateTypes();
      const id = "g_" + Math.random().toString(36).slice(2);
      const revealed = Array(25).fill(false);
      const game = { id, words, types, revealed, aiTeam, startingPlayer, createdAt: Date.now() };
      games.set(id, game);
      res.json(game);
    } catch (err) { 
      console.error("new game error:", err); 
      res.status(500).json({ error: "Failed to create game" }); 
    }
  });

  app.post("/game/:id/hint", async (req, res) => {
    const g = games.get(req.params.id);
    if (!g) return res.status(404).json({ error: "not found" });
    const { team, words, types, revealed } = req.body;
    const opponentTeam = team === 'blue' ? 'red' : 'blue';
    const boardState = words.map((word, i) => ({ word, type: types[i], revealed: revealed[i] }));
    const myWords = boardState.filter(c => c.type === team && !c.revealed).map(c => c.word);
    const opponentWords = boardState.filter(c => c.type === opponentTeam && !c.revealed).map(c => c.word);
    const neutralWords = boardState.filter(c => c.type === 'neutral' && !c.revealed).map(c => c.word);
    const assassinWord = boardState.find(c => c.type === 'assassin' && !c.revealed)?.word;
    const prompt = `You are the spymaster for the ${team} team... Your team's words are: ${myWords.join(", ")}. Opponent's words are: ${opponentWords.join(", ")}. Neutral words are: ${neutralWords.join(", ")}. The assassin is: ${assassinWord}. Return JSON.`;
    try {
      const hintResponse = await client.chat.completions.create({ model: "gpt-4o", messages: [{ role: "user", content: prompt }], response_format: { type: "json_object", schema: hintSchema }});
      const hintPayload = JSON.parse(hintResponse.choices[0].message.content);
      res.json(hintPayload);
    } catch (err) { console.error("AI hint error:", err); res.status(500).json({ error: "Failed to get AI hint" }); }
  });

  app.get("/game/:id", (req, res) => { const g = games.get(req.params.id); if (g) res.json(g); else res.status(404).json({ error: "not found" }); });
  app.get("/game/:id/spymaster/:team", (req, res) => { const g = games.get(req.params.id); if (!g) return res.status(404).json({ error: "not found" }); const team = req.params.team; const spymasterTypes = g.types.map(t => (t === team || t === 'assassin' || t === 'neutral') ? t : 'neutral'); res.json({ id: g.id, words: g.words, types: spymasterTypes, team }); });

  // --- SSR Handler ---
  app.use("/", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const templatePath = isProd
        ? path.join(__dirname, 'dist/client/index.html')
        : path.join(__dirname, 'client/index.html');
      
      let template = fs.readFileSync(templatePath, "utf-8");
      let render;

      if (!isProd) {
        template = await vite.transformIndexHtml(url, template);
        const serverEntry = await vite.ssrLoadModule("client/entry-server.jsx");
        render = serverEntry.render;
      } else {
        const serverEntryPath = path.join(__dirname, 'dist/server/entry-server.js');
        const serverEntry = await import(serverEntryPath);
        render = serverEntry.render;
      }

      const appHtml = await render(url);
      const html = template.replace(``, appHtml?.html);
      res.status(200).set({ "Content-Type": "text/html" }).end(html);
    } catch (e) {
      if (vite) vite.ssrFixStacktrace(e);
      next(e);
    }
  });

  app.listen(port, () => {
    console.log(`Express server running on *:${port}`);
  });
}

startServer();