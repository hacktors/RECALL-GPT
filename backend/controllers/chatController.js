import { generateGroundedAnswer, isGeminiConfigurationError } from "../config/gemini.js";
import {
  countCollection,
  documentCollectionName,
  getChromaStatus,
  isExternalChromaSource
} from "../config/db.js";
import { hybridSearch, searchFeedbackExamples } from "../services/searchService.js";
import { logFeedback } from "../services/feedbackService.js";

function noIndexedContextAnswer() {
  if (isExternalChromaSource) {
    return `I could not find this information in the connected Chroma collection. The collection "${documentCollectionName}" is empty or unavailable right now. Confirm the n8n workflow has written documents into that collection, then sync the dashboard.`;
  }

  return "I could not find this information in the uploaded documents. The RAG index is empty right now. Start ChromaDB, add source files to backend/doc, click Re-index Documents, then ask again.";
}

function noContextMatchAnswer() {
  return isExternalChromaSource
    ? "I could not find this information in the connected Chroma collection."
    : "I could not find this information in the uploaded documents.";
}

function formatHistory(history = []) {
  return history
    .slice(-8)
    .map((message) => {
      const role = message.role === "assistant" ? "Assistant" : "User";
      return `${role}: ${String(message.content || "").trim()}`;
    })
    .filter((line) => !line.endsWith(":"))
    .join("\n");
}

function formatContext(chunks) {
  return chunks
    .map((chunk, index) => {
      const metadata = chunk.metadata || {};
      return `[${index + 1}] Source: ${metadata.file_name}, Chunk: ${metadata.chunk_id}\n${chunk.text}`;
    })
    .join("\n\n");
}

function formatExemplars(examples) {
  if (!examples.length) return "No successful past exemplars found.";

  return examples
    .map((example, index) => {
      const metadata = example.metadata || {};
      return `Example ${index + 1}\nQuestion: ${metadata.question || ""}\nAnswer: ${
        metadata.answer || example.text || ""
      }`;
    })
    .join("\n\n");
}

function buildPrompt({ message, history, contextChunks, exemplars }) {
  const sourceLabel = isExternalChromaSource
    ? "connected Chroma collection"
    : "uploaded documents";
  const noMatchAnswer = noContextMatchAnswer();

  return `You are an uncompromising, production-grade RAG assistant.
Task: Answer the User Question using ONLY the provided Document Context from the ${sourceLabel} and guided by successful Past Exemplars.

[Past Exemplars]
${formatExemplars(exemplars)}

[Document Context]
${formatContext(contextChunks) || "No document context was retrieved."}

[Conversation History]
${formatHistory(history) || "No prior conversation history."}

Strict Rule 1: If the answer cannot be confidently derived directly from the Document Context, reply exactly: "${noMatchAnswer}" Do not hallucinate or extrapolate.
Strict Rule 2: Provide clear inline citations linking back to the source file name.

User Question: ${message}`;
}

export async function chat(req, res, next) {
  try {
    const message = String(req.body?.message || "").trim();
    const history = Array.isArray(req.body?.history) ? req.body.history : [];

    if (!message) {
      return res.status(400).json({ error: "message is required" });
    }

    const chroma = await getChromaStatus();
    if (!chroma.ok) {
      return res.json({
        answer: noIndexedContextAnswer(),
        citations: [],
        feedback_optimized: false,
        retrieval_ready: false,
        retrieval_status: {
          chromadb: chroma,
          indexed_chunk_count: 0
        }
      });
    }

    const indexedChunkCount = await countCollection(documentCollectionName);
    if (!indexedChunkCount) {
      return res.json({
        answer: noIndexedContextAnswer(),
        citations: [],
        feedback_optimized: false,
        retrieval_ready: false,
        retrieval_status: {
          chromadb: chroma,
          indexed_chunk_count: indexedChunkCount
        }
      });
    }

    const [contextChunks, exemplars] = await Promise.all([
      hybridSearch(message),
      searchFeedbackExamples(message, 2)
    ]);

    if (!contextChunks.length) {
      return res.json({
        answer: noContextMatchAnswer(),
        citations: [],
        feedback_optimized: exemplars.length > 0,
        retrieval_ready: true,
        retrieval_status: {
          chromadb: chroma,
          indexed_chunk_count: indexedChunkCount
        }
      });
    }

    const prompt = buildPrompt({ message, history, contextChunks, exemplars });
    const answer = await generateGroundedAnswer(prompt);
    const citations = contextChunks.map((chunk) => ({
      file_name: chunk.metadata?.file_name,
      chunk_id: chunk.metadata?.chunk_id,
      page_number: chunk.metadata?.page_number,
      extraction_method: chunk.metadata?.extraction_method,
      source_path: chunk.metadata?.source_path,
      text: chunk.text,
      search_origin: chunk.search_origin || "hybrid",
      similarity_score: Number.isFinite(chunk.score) ? Number(chunk.score.toFixed(4)) : null
    }));

    return res.json({
      answer,
      citations,
      feedback_optimized: exemplars.length > 0,
      retrieval_ready: true,
      retrieval_status: {
        chromadb: chroma,
        indexed_chunk_count: indexedChunkCount
      }
    });
  } catch (error) {
    return next(error);
  }
}

export async function feedback(req, res, next) {
  try {
    const chroma = await getChromaStatus();
    if (!chroma.ok) {
      return res.status(202).json({
        stored: false,
        reason: "Feedback was not stored because ChromaDB is offline.",
        action_required: "Start ChromaDB on http://localhost:8000, then submit feedback again.",
        chromadb: chroma
      });
    }

    const result = await logFeedback(req.body || {});
    return res.status(result.stored ? 201 : 202).json(result);
  } catch (error) {
    if (isGeminiConfigurationError(error)) {
      return res.status(202).json({
        stored: false,
        reason: error.message,
        action_required:
          "Renew GEMINI_API_KEY in backend/.env, restart the backend, then submit feedback again."
      });
    }

    return next(error);
  }
}
