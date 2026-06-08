import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { chat, feedback } from "./controllers/chatController.js";
import { dashboard, reindex } from "./controllers/indexController.js";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 8080);
const host = process.env.HOST || "0.0.0.0";
const localFrontendOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5174",
  "http://localhost:4173",
  "http://127.0.0.1:4173"
];
const hostedFrontendOrigins = ["https://recall-gpt.vercel.app", "https://*.vercel.app"];
function originMatcher(value) {
  const normalized = String(value || "").trim().replace(/\/$/, "");
  if (!normalized) return null;

  if (normalized.includes("*")) {
    const pattern = normalized
      .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*");
    const regex = new RegExp(`^${pattern}$`);
    return (origin) => regex.test(origin);
  }

  return (origin) => origin === normalized;
}

const configuredFrontendOrigins = (process.env.FRONTEND_ORIGIN || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const allowedOriginMatchers = [
  ...localFrontendOrigins,
  ...hostedFrontendOrigins,
  ...configuredFrontendOrigins
]
  .map(originMatcher)
  .filter(Boolean);

function isAllowedOrigin(origin) {
  return !origin || allowedOriginMatchers.some((matcher) => matcher(origin));
}

app.use(helmet());
app.use(
  cors({
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    optionsSuccessStatus: 204,
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS blocked origin: ${origin}`));
    }
  })
);
app.use(express.json({ limit: "2mb" }));
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "recall-gpt-backend" });
});
app.get("/api/dashboard", dashboard);
app.post("/api/reindex", reindex);
app.post("/api/chat", chat);
app.post("/api/feedback", feedback);

app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.use((error, req, res, next) => {
  const status = error.status || 500;
  const payload = {
    error: status === 500 ? "Internal server error" : error.message
  };

  if (process.env.NODE_ENV !== "production") {
    payload.detail = error.message;
  }

  if (error.provider || status < 500) {
    console.warn(error.message);
  } else {
    console.error(error);
  }
  res.status(status).json(payload);
});

if (!process.env.VERCEL) {
  const server = app.listen(port, host, () => {
    console.log(`RECALL GPT backend listening on http://localhost:${port}`);
  });

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(
        `Port ${port} is already in use. Stop the existing backend process or set PORT to another value.`
      );
      process.exit(1);
    }

    throw error;
  });
}

export default app;
