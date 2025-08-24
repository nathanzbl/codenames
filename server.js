import express from "express";
import fs from "fs";
import path from 'path';
import { fileURLToPath } from 'url';
import "dotenv/config";
import OpenAI from "openai";

// --- Environment Setup ---
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === 'production';

const app = express();
const port = process.env.PORT || 3000;
const apiKey = process.env.OPENAI_API_KEY;

const client = new OpenAI({ apiKey });
const games = new Map();
const GAME_TTL_MS = 1000 * 60 * 60 * 6;

app.use(express.json());

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

  // --- API Endpoints ---
  app.post("/game/new", async (req, res) => {
    try {
      const { aiTeam } = req.body;
      const words1 = await client.responses.create({
        // Use a model that actually supports text.format structured outputs
        model: "gpt-4o-mini",
        input:
          "Return exactly 25 unique and interesting one-word entries that an 12th grader could understand. Lowercase ASCII only. return as a JSON format with a single key 'words' and an array of words as the value. have the output be all on one line",
        text: { format: { "type": "json_schema", "name": "codenames_words", "schema": wordsSchema}},
        temperature: 1.5
        
      });
      const payload = JSON.parse(words1.choices[0].message.content);
      const words = payload.words;
      const { types, startingPlayer } = generateTypes();
      const id = "g_" + Math.random().toString(36).slice(2);
      const revealed = Array(25).fill(false);
      const game = { id, words, types, revealed, aiTeam, startingPlayer, createdAt: Date.now() };
      games.set(id, game);
      res.json(game);
    } catch (err) { console.error("new game error:", err); res.status(500).json({ error: "Failed to create game" }); }
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
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const templatePath = isProd
        ? path.join(__dirname, 'dist/client/index.html')
        : path.join(__dirname, 'client/index.html');
      
      let template = fs.readFileSync(templatePath, "utf-8");
      let render;

      if (!isProd) {
        template = await vite.transformIndexHtml(url, template);
        const serverEntry = await vite.ssrLoadModule("/client/entry-server.jsx");
        render = serverEntry.render;
      } else {
        const serverEntryPath = path.join(__dirname, 'dist/server/entry-server.js');
        const serverEntry = await import(serverEntryPath);
        render = serverEntry.render;
      }

      const appHtml = await render(url);
      const html = template.replace(`<!--ssr-outlet-->`, appHtml?.html);
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
