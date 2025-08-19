import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { PassThrough } from "stream";
import { SpeechClient } from "@google-cloud/speech";
import path from "path";
import http from "http";
import WebSocket, { WebSocketServer } from "ws";

dotenv.config();

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 7214;
const CREDENTIALS = process.env.GOOGLE_APPLICATION_CREDENTIALS;

if (!CREDENTIALS) {
  throw new Error("GOOGLE_APPLICATION_CREDENTIALS is not set in .env");
}

// Resolve path to credentials JSON
const credentialsPath = path.resolve(CREDENTIALS);

// Initialize Google Speech client with explicit credentials
const speechClient = new SpeechClient({
  keyFilename: credentialsPath,
});

const app = express();
app.use(cors());
app.use(express.json());

// --- Streaming variables for REST mode ---
let audioStream: PassThrough | null = null;
let recognizeStream: any = null;

// --- Start streaming session (REST mode) ---
app.post("/start-stream", (_req, res) => {
  try {
    audioStream = new PassThrough();

    recognizeStream = speechClient
      .streamingRecognize({
        config: {
          encoding: "WEBM_OPUS",   // Matches Chrome MediaRecorder default
          sampleRateHertz: 48000,  // Matches WebM Opus
          languageCode: "en-US",
        },
        interimResults: true, // Return partial results
      })
      .on("error", (err: any) => console.error("Google API error:", err))
      .on("data", (data: any) => {
        const transcript = data.results[0]?.alternatives[0]?.transcript;
        if (transcript) {
          console.log("Transcription (REST):", transcript);
        }
      });

    audioStream.pipe(recognizeStream);

    res.json({ message: "Streaming session started (REST)" });
  } catch (err) {
    console.error("Failed to start stream:", err);
    res.status(500).json({ error: "Failed to start streaming" });
  }
});

// --- Push audio chunk (REST mode) ---
app.post("/stream-chunk", express.raw({ type: "audio/webm" }), (req, res) => {
  try {
    if (!audioStream) {
      return res.status(400).json({ error: "Stream not initialized" });
    }
    console.log("Received audio chunk of size:", req.body);
    audioStream.write(req.body);
    res.json({ message: "Chunk received" });
  } catch (err) {
    console.error("Error writing chunk:", err);
    res.status(500).json({ error: "Failed to write audio chunk" });
  }
});

// --- Stop streaming session (REST mode) ---
app.post("/stop-stream", (_req, res) => {
  try {
    if (audioStream) audioStream.end();
    audioStream = null;

    if (recognizeStream) recognizeStream.end();
    recognizeStream = null;

    res.json({ message: "Streaming session stopped" });
  } catch (err) {
    console.error("Error stopping stream:", err);
    res.status(500).json({ error: "Failed to stop streaming" });
  }
});

// --- HTTP server wrapper ---
const server = http.createServer(app);

// --- WebSocket server for real-time streaming ---
const wss = new WebSocketServer({ server });

wss.on("connection", (ws : any) => {
  console.log("🔗 WebSocket client connected for transcription");

  const recognizeStream = speechClient
    .streamingRecognize({
      config: {
        encoding: "WEBM_OPUS",   // Chrome MediaRecorder default
        sampleRateHertz: 48000,  // WebM Opus default
        languageCode: "en-US",
      },
      interimResults: true,
    })
    .on("error", (err) => {
      console.error("Google API error (WS):", err);
      ws.send(JSON.stringify({ error: err.message }));
    })
    .on("data", (data) => {
      const transcript = data.results[0]?.alternatives[0]?.transcript || "";
      ws.send(
        JSON.stringify({
          transcript,
          isFinal: data.results[0]?.isFinal,
        })
      );
    });

  ws.on("message", (message : any) => {
    // message = ArrayBuffer from client audio
    recognizeStream.write(message);
  });

  ws.on("close", () => {
    console.log("❌ WebSocket client disconnected");
    recognizeStream.end();
  });
});

// --- Start server ---
server.listen(PORT, () => {
  console.log(`✅ Server listening on port ${PORT} (REST + WebSocket ready)`);
});
