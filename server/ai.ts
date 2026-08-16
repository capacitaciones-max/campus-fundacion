import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
// Configurable model via environment variable
const modelName = process.env.GEMINI_MODEL || "gemini-3.6-flash";

if (!apiKey) {
  console.warn("GEMINI_API_KEY no está configurada en las variables de entorno.");
}

export const ai = new GoogleGenAI({
  apiKey: apiKey || "",
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

export const AI_MODEL = modelName;

console.log(`IA configurada con el modelo: ${AI_MODEL}`);
