import express from "express";
import multer from "multer";
import cors from "cors";
import fs from "fs";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import {
  GoogleGenAI,
  createUserContent,
  createPartFromUri,
} from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const tmpDir = path.join(__dirname, "tmp");

// Create tmp folder if it doesn't exist
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}

// Multer storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, tmpDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || ".webm";
    const filename = `chunk-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, filename);
  },
});
const upload = multer({ storage });

const geminiApiKey = process.env.GEMINI_API_KEY;
if (!geminiApiKey) throw new Error("GEMINI_API_KEY is not set.");

const ai = new GoogleGenAI({ apiKey: geminiApiKey });
const PORT = 7214;

app.use(cors({ origin: "*" }));
app.listen(PORT, () => console.log(`Backend listening on port ${PORT}`));

app.get("/", (_req, res) => res.send("Hello from Express!"));

// --- Transcribe endpoint ---
app.post("/transcribe", upload.single("file"), async (req, res) => {
  if (!req.file)
    return res.status(400).json({ error: "No audio file uploaded." });

  const filePath = req.file.path;

  try {
    // Upload the chunk
    const uploadedFile = await ai.files.upload({
      file: filePath,
      config: { mimeType: req.file.mimetype },
    }) as { uri: string; mimeType: string };

    if (!uploadedFile.uri || !uploadedFile.mimeType)
      throw new Error("Uploaded file did not return valid URI or MIME type.");
    console.log("Uploaded file:", uploadedFile.mimeType, uploadedFile.uri);
    try {
    // Generate transcript for this chunk
    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: createUserContent([
        createPartFromUri(uploadedFile.uri, uploadedFile.mimeType),
        "Generate a transcript of the speech with timestamp.",
      ]),
    });

    res.json({ text: result.text });
    } catch (error: any) {
      res.status(500).json({ error: "google API failed.", detail: error });
    }


  } catch (err: any) {
    console.error("Transcription error:", err);
    res.status(500).json({ error: "Transcription failed.", detail: err.message });
  } finally {
    // Delete temp file after upload & transcription
    try {
      await fs.promises.unlink(filePath);
    } catch (e) {
      console.error("Failed to delete temp file:", e);
    }
  }
});