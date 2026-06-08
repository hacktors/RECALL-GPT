import { randomUUID } from "node:crypto";
import { feedbackCollectionName, getCollection } from "../config/db.js";
import { embedText } from "../config/gemini.js";

export async function logFeedback({ question, answer, correction, rating }) {
  const cleanQuestion = String(question || "").trim();
  const cleanAnswer = String(answer || "").trim();
  const cleanCorrection = String(correction || "").trim();
  const numericRating = Number(rating);

  if (!cleanQuestion) {
    const error = new Error("question is required");
    error.status = 400;
    throw error;
  }

  if (!cleanAnswer && !cleanCorrection) {
    const error = new Error("answer or correction is required");
    error.status = 400;
    throw error;
  }

  if (Number.isFinite(numericRating) && numericRating < 4 && !cleanCorrection) {
    return {
      stored: false,
      reason: "Low-rated feedback is ignored unless a correction is supplied."
    };
  }

  const exemplarAnswer = cleanCorrection || cleanAnswer;
  const document = `Question: ${cleanQuestion}\nAnswer: ${exemplarAnswer}`;
  const embedding = await embedText(document);
  const collection = await getCollection(feedbackCollectionName);
  const id = randomUUID();

  await collection.add({
    ids: [id],
    documents: [document],
    embeddings: [embedding],
    metadatas: [
      {
        question: cleanQuestion,
        answer: exemplarAnswer,
        original_answer: cleanAnswer,
        rating: Number.isFinite(numericRating) ? String(numericRating) : "",
        timestamp: new Date().toISOString()
      }
    ]
  });

  return { stored: true, id };
}
