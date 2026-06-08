import {
  countCollection,
  documentCollectionName,
  feedbackCollectionName,
  getChromaStatus,
  isExternalChromaSource
} from "../config/db.js";
import { isGeminiConfigurationError } from "../config/gemini.js";
import { inspectDocumentSources } from "../services/parserService.js";
import {
  getDocumentCollectionInventory,
  getExistingChromaSourceInventory,
  reindexDocuments
} from "../services/searchService.js";

const DEFAULT_FILE_INDEX_TIMEOUT_MS = 10_000;

function getFileIndexTimeoutMs() {
  const configured = Number(process.env.INDEX_FILE_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_FILE_INDEX_TIMEOUT_MS;
}

function shapeDashboardPayload({
  chroma,
  sourceInventory,
  indexedInventory,
  feedbackCount
}) {
  const failures = sourceInventory.failures || [];
  const unparseableOrTimedOutFiles = failures.map((failure) => failure.file_name);
  const indexedByName = new Map(
    (indexedInventory.documents || []).map((document) => [document.file_name, document])
  );
  const documents = (sourceInventory.documents || []).map((document) => {
    const indexed = indexedByName.get(document.file_name);
    if (!indexed) return document;

    return {
      ...document,
      chunk_count: indexed.chunk_count,
      extraction_method: indexed.extraction_method || document.extraction_method,
      page_count: indexed.page_count ?? document.page_count,
      status: "parsed"
    };
  });

  return {
    chromadb: chroma,
    data_source: isExternalChromaSource ? "chroma" : "local_documents",
    collection_name: documentCollectionName,
    totalDocuments: sourceInventory.total_documents,
    totalChunks: indexedInventory.chunkCount,
    unparseableOrTimedOutFiles,
    document_count: sourceInventory.total_documents,
    source_chunk_count: sourceInventory.source_chunk_count,
    indexed_chunk_count: indexedInventory.chunkCount,
    feedback_loop_count: feedbackCount,
    documents,
    parse_failures: failures,
    extraction_logs: sourceInventory.extraction_logs || [],
    last_indexed_at: sourceInventory.indexed_at,
    partial_error: failures.length > 0
  };
}

async function getIndexedInventory() {
  try {
    return await getDocumentCollectionInventory();
  } catch {
    return { chunkCount: 0, documents: [] };
  }
}

export async function reindex(req, res, next) {
  try {
    const chroma = await getChromaStatus();
    if (!chroma.ok) {
      return res.status(503).json({
        error: isExternalChromaSource
          ? "ChromaDB is offline. Check the existing Chroma connection variables in backend/.env, then restart the backend."
          : "ChromaDB is offline. Start ChromaDB on http://localhost:8000 before re-indexing documents.",
        chromadb: chroma
      });
    }

    const fileTimeoutMs = getFileIndexTimeoutMs();
    const stats = await reindexDocuments({
      fileTimeoutMs,
      allowOcr: true,
      collectChunks: true
    });

    return res.status(stats.failed_count > 0 ? 207 : 200).json({
      ...stats,
      file_timeout_ms: fileTimeoutMs,
      partial_error: stats.failed_count > 0,
      message: isExternalChromaSource
        ? stats.failed_count > 0
          ? "Existing Chroma collection sync completed with diagnostics."
          : "Existing Chroma collection synced successfully. No local documents were parsed or overwritten."
        : stats.failed_count > 0
          ? "Index completed with one or more unparseable or timed-out files."
          : "Index completed successfully."
    });
  } catch (error) {
    if (isGeminiConfigurationError(error)) {
      return res.status(503).json({
        error: error.message,
        action_required:
          "Renew GEMINI_API_KEY in backend/.env, restart the backend, then re-index documents."
      });
    }

    return next(error);
  }
}

export async function dashboard(req, res, next) {
  try {
    const sourceInventoryPromise = isExternalChromaSource
      ? getExistingChromaSourceInventory()
      : inspectDocumentSources();
    const [chroma, sourceInventory, indexedInventory, feedbackCount] = await Promise.all([
      getChromaStatus(),
      sourceInventoryPromise,
      getIndexedInventory(),
      countCollection(feedbackCollectionName)
    ]);

    return res.json(
      shapeDashboardPayload({
        chroma,
        sourceInventory,
        indexedInventory,
        feedbackCount
      })
    );
  } catch (error) {
    return next(error);
  }
}
