import { serve } from "bun";
import { readFileSync, existsSync } from "fs";
import { join, dirname, resolve } from "path";

const __dir = dirname(new URL(import.meta.url).pathname);

// Walk up to find .env in repo root
function loadEnvFromRoot() {
  let dir = __dir;
  for (let i = 0; i < 10; i++) {
    const envPath = join(dir, ".env");
    if (existsSync(envPath)) {
      const lines = readFileSync(envPath, "utf-8").split("\n");
      for (const line of lines) {
        const match = line.match(/^(\w+)=(.+)$/);
        if (match && !process.env[match[1]]) {
          process.env[match[1]] = match[2].trim();
        }
      }
      return envPath;
    }
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

const envFile = loadEnvFromRoot();
const GROQ_API_KEY = process.env.GROQ_API_KEY;

if (!GROQ_API_KEY) {
  console.error("\n  Missing GROQ_API_KEY environment variable.");
  console.error("  Get a free key at: https://console.groq.com/keys");
  console.error("  Then run: GROQ_API_KEY=gsk_... bun run server.js\n");
  process.exit(1);
}

console.log("Starting Groq Speech Test server...");

serve({
  port: 3847,
  async fetch(req) {
    const url = new URL(req.url);

    // Serve the test page
    if (url.pathname === "/" || url.pathname === "/index.html") {
      const html = readFileSync(join(__dir, "index.html"), "utf-8");
      return new Response(html, { headers: { "Content-Type": "text/html" } });
    }

    // Proxy transcription to Groq
    if (url.pathname === "/transcribe" && req.method === "POST") {
      try {
        const formData = await req.formData();
        const audioBlob = formData.get("audio");
        const prompt = formData.get("prompt") || "";

        if (!audioBlob) {
          return Response.json({ error: "No audio provided" }, { status: 400 });
        }

        // Build Groq API request
        const groqForm = new FormData();
        groqForm.append("file", audioBlob, "audio.webm");
        groqForm.append("model", "whisper-large-v3");
        groqForm.append("language", "en");
        groqForm.append("response_format", "verbose_json");
        if (prompt) {
          groqForm.append("prompt", prompt);
        }

        const startTime = Date.now();
        const groqRes = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
          method: "POST",
          headers: { "Authorization": `Bearer ${GROQ_API_KEY}` },
          body: groqForm,
        });

        const latencyMs = Date.now() - startTime;

        if (!groqRes.ok) {
          const errText = await groqRes.text();
          console.error("Groq API error:", groqRes.status, errText);
          return Response.json({ error: `Groq API error: ${groqRes.status}`, details: errText }, { status: 502 });
        }

        const result = await groqRes.json();
        return Response.json({
          text: result.text,
          language: result.language,
          duration: result.duration,
          latencyMs,
        });
      } catch (err) {
        console.error("Transcription error:", err);
        return Response.json({ error: err.message }, { status: 500 });
      }
    }

    return new Response("Not found", { status: 404 });
  },
});

console.log("\n  Groq Speech Test running at: http://localhost:3847");
console.log("  Open this URL on your phone (same Wi-Fi) or in your browser.\n");
