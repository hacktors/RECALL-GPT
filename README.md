# RECALL GPT

Production-ready hybrid-search RAG web application with a Vite/React frontend, an Express backend, Chroma retrieval, Gemini generation, and feedback-driven in-context learning.

## Local Setup

1. Start ChromaDB locally on `http://localhost:8000`.
2. Put `.pdf`, `.docx`, `.txt`, `.md`, `.pptx`, `.xlsx`, `.png`, `.jpg`, or `.jpeg` source files in `backend/doc`.
3. Copy `backend/.env.example` to `backend/.env` and set `GEMINI_API_KEY`.
4. Copy `frontend/.env.example` to `frontend/.env` if you want explicit local API variables.
5. Run the backend:

```bash
cd backend
npm install
npm run dev
```

6. Run the frontend:

```bash
cd frontend
npm install
npm run dev
```

The frontend defaults to `http://localhost:5173` and the backend defaults to `http://localhost:8080`.

## API

- `GET /api/health` returns backend health for Render checks.
- `GET /api/dashboard` returns Chroma status, document count, chunk count, and feedback count.
- `POST /api/reindex` rescans `backend/doc`, resets `document_collection`, embeds chunks, and returns indexing stats.
- `POST /api/chat` accepts `{ "message": "...", "history": [...] }` and returns an answer with citations.
- `POST /api/feedback` stores highly rated or corrected Q&A exemplars in `feedback_collection`.

## Deploy Backend To Render

The repo includes `render.yaml` for a Render web service:

- Root directory: `backend`
- Build command: `npm ci && npm run build`
- Start command: `npm start`
- Health check path: `/api/health`

Required Render environment variables:

- `NODE_ENV=production`
- `GEMINI_API_KEY`
- `FRONTEND_ORIGIN`, for example `https://your-vercel-app.vercel.app`

Production CORS allows Vercel deployments by default with `https://*.vercel.app` and also allows any origins listed in `FRONTEND_ORIGIN`.

For production RAG retrieval, connect Render to an external Chroma server or Chroma Cloud by setting the matching variables from `backend/.env.example`. Without a reachable Chroma service, the backend still deploys and `/api/health` works, but retrieval endpoints report Chroma as offline.

## Deploy Frontend To Vercel

Recommended Vercel settings:

- Import this GitHub repository.
- Set Root Directory to `frontend`.
- Framework preset: Vite.
- Build command: `npm run build`.
- Output directory: `dist`.
- Environment variable: `VITE_API_BASE_URL=https://your-render-backend.onrender.com`.

If `VITE_API_BASE_URL` is not set, production frontend builds default to `https://recall-gpt.onrender.com`. Override it in Vercel if your Render backend URL changes.

The repo also includes a root `vercel.json`, so a Vercel project created from the repository root will still build and publish `frontend/dist`.

## Git Notes

The repository intentionally ignores local secrets, `node_modules`, build output, logs, and local Chroma data. Keep real `.env` files in the deployment dashboards, not in Git.
