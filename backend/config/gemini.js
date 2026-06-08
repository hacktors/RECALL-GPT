import dotenv from "dotenv";

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
const apiBase = "https://generativelanguage.googleapis.com/v1beta";

export const embeddingModelName =
  process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001";
export const chatModelName = process.env.GEMINI_CHAT_MODEL || "gemini-2.5-flash-lite";

function modelPath(modelName) {
  return modelName.startsWith("models/") ? modelName : `models/${modelName}`;
}

function createGeminiError(message, status = 503, code = "GEMINI_PROVIDER_ERROR") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  error.provider = "gemini";
  return error;
}

function classifyGeminiError(message, status) {
  const normalized = message.toLowerCase();

  if (normalized.includes("api key expired")) {
    return createGeminiError(
      "Gemini API key expired. Renew GEMINI_API_KEY in backend/.env, then restart the backend.",
      503,
      "GEMINI_API_KEY_EXPIRED"
    );
  }

  if (normalized.includes("api key") || normalized.includes("permission")) {
    return createGeminiError(
      "Gemini API key is not valid for this request. Update GEMINI_API_KEY in backend/.env, then restart the backend.",
      503,
      "GEMINI_API_KEY_INVALID"
    );
  }

  if (normalized.includes("quota") || normalized.includes("rate-limit")) {
    return createGeminiError(
      "Gemini quota is exhausted for the configured model. Check your Gemini plan/billing or set GEMINI_CHAT_MODEL to a model with available quota.",
      429,
      "GEMINI_QUOTA_EXCEEDED"
    );
  }

  return createGeminiError(message, status >= 500 ? 503 : 502);
}

export function isGeminiConfigurationError(error) {
  return (
    error?.provider === "gemini" &&
    ["GEMINI_API_KEY_MISSING", "GEMINI_API_KEY_EXPIRED", "GEMINI_API_KEY_INVALID"].includes(
      error.code
    )
  );
}

export function assertGeminiConfigured() {
  if (!apiKey) {
    throw createGeminiError(
      "GEMINI_API_KEY is required in backend/.env.",
      503,
      "GEMINI_API_KEY_MISSING"
    );
  }
}

async function postGemini(path, body) {
  assertGeminiConfigured();
  let response;
  try {
    response = await fetch(`${apiBase}/${path}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  } catch (error) {
    const cause = error?.cause?.message || error?.message || "Gemini request failed";
    throw createGeminiError(
      `Unable to reach Gemini API: ${cause}`,
      503,
      "GEMINI_NETWORK_ERROR"
    );
  }

  const payload = await response.json();
  if (!response.ok) {
    const message = payload?.error?.message || "Gemini API request failed";
    throw classifyGeminiError(message, response.status);
  }

  return payload;
}

export async function embedText(text) {
  const model = modelPath(embeddingModelName);
  const payload = await postGemini(`${model}:embedContent`, {
    model,
    content: {
      parts: [{ text }]
    }
  });

  return payload.embedding.values;
}

export async function embedBatch(texts, concurrency = 5) {
  const embeddings = new Array(texts.length);
  let cursor = 0;

  async function worker() {
    while (cursor < texts.length) {
      const index = cursor;
      cursor += 1;
      embeddings[index] = await embedText(texts[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, texts.length) }, () => worker())
  );

  return embeddings;
}

export async function generateGroundedAnswer(prompt) {
  const model = modelPath(chatModelName);
  const payload = await postGemini(`${model}:generateContent`, {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }]
      }
    ],
    generationConfig: {
      temperature: 0.2,
      topP: 0.85,
      maxOutputTokens: 1400
    }
  });

  const parts = payload?.candidates?.[0]?.content?.parts || [];
  const text = parts.map((part) => part.text || "").join("").trim();

  if (!text) {
    throw new Error("Gemini returned an empty response");
  }

  return text;
}
