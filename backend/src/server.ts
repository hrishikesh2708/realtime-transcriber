import express from "express";
import multer from "multer";
import cors from "cors";
import fs from "fs";
import dotenv from "dotenv";
import {
  GoogleGenAI,
  createUserContent,
  createPartFromUri,
} from "@google/genai";

const app = express();
const upload = multer({ dest: "uploads/" });
app.use(cors({ origin: "*" }));
dotenv.config();


const geminiApiKey = process.env.GEMINI_API_KEY;
console.log("GEMINI_API_KEY:", geminiApiKey);
if (!geminiApiKey) {
  throw new Error("GEMINI_API_KEY is not set in environment variables.");
}

const ai = new GoogleGenAI({ apiKey: geminiApiKey });
const PORT = 7214;

app.listen(PORT, () => {
  console.log(`🏃‍♂️ Speech-to-text backend listening on port ${PORT}`);
});

app.get("/", (req, res) => {
  res.send("Hello from Express!");
});

app.post("/transcribe", upload.single("file"), async (req, res) => {
  if (!req.file)
    return res.status(400).json({ error: "No audio file uploaded." });

  try {
    // 1️⃣ Upload the audio file
    const uploadedFile = (await ai.files.upload({
      file: req.file.path,
      config: { mimeType: req.file.mimetype },
    })) as { uri: string; mimeType: string };

    if (!uploadedFile.uri || !uploadedFile.mimeType) {
      throw new Error("Uploaded file did not return a valid URI or MIME type.");
    }

    // 2️⃣ Generate transcript
    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: createUserContent([
        createPartFromUri(uploadedFile.uri, uploadedFile.mimeType),
        "Generate a transcript of the speech with timestamp.",
      ]),
    });

    res.json({ text: result.text });
  } catch (err: any) {
    console.error("Transcription error:", err);
    res.status(500).json({ error: "Transcription failed." });
  } finally {
    // Delete local uploaded file
    fs.unlink(req.file.path, () => {});
  }
});
