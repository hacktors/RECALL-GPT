import {
  chromaQueryMode,
  documentCollectionName,
  feedbackCollectionName,
  getDocumentCollection,
  getCollection,
  isExternalChromaSource,
  resetCollection
} from "../config/db.js";
import { embedBatch, embedText } from "../config/gemini.js";
import { parseDocuments } from "./parserService.js";

const VECTOR_RESULTS = 10;
const KEYWORD_RESULTS = 10;
const FINAL_CONTEXT_RESULTS = 5;
const DEFAULT_COLLECTION_SCAN_BATCH_SIZE = 500;
const DEFAULT_COLLECTION_SCAN_LIMIT = 5000;

let keywordCache = [];
let keywordCacheCollectionCount = 0;

const TEXT_METADATA_KEYS = [
  "text",
  "content",
  "page_content",
  "pageContent",
  "chunk",
  "chunk_text",
  "document",
  "body",
  "raw_text"
];
const SOURCE_METADATA_KEYS = [
  "file_name",
  "filename",
  "file",
  "source_file",
  "source",
  "source_path",
  "path",
  "url",
  "title",
  "name"
];

function toPositiveInteger(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : fallback;
}

function getCollectionScanBatchSize() {
  return toPositiveInteger(
    process.env.CHROMA_COLLECTION_SCAN_BATCH_SIZE,
    DEFAULT_COLLECTION_SCAN_BATCH_SIZE
  );
}

function getCollectionScanLimit() {
  return toPositiveInteger(process.env.CHROMA_COLLECTION_SCAN_LIMIT, DEFAULT_COLLECTION_SCAN_LIMIT);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tokenizeQuery(query) {
  return String(query || "")
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.replace(/[^a-z0-9_-]/gi, ""))
    .filter((token) => token.length > 1);
}

function keywordScore(text, query) {
  const normalizedText = String(text || "").toLowerCase();
  const normalizedQuery = String(query || "").trim().toLowerCase();
  const tokens = tokenizeQuery(query);
  let score = 0;

  if (normalizedQuery && normalizedText.includes(normalizedQuery)) {
    score += 5;
  }

  for (const token of tokens) {
    const matches = normalizedText.match(new RegExp(`\\b${escapeRegex(token)}\\b`, "g"));
    score += matches ? matches.length : 0;
  }

  return score;
}

function metadataValue(metadata, keys) {
  for (const key of keys) {
    const value = metadata?.[key];
    if (value === undefined || value === null) continue;

    const normalized = String(value).trim();
    if (normalized) return normalized;
  }

  return "";
}

function basenameFromSource(value) {
  const rawValue = String(value || "").trim();
  if (!rawValue) return "";

  try {
    if (/^https?:\/\//i.test(rawValue)) {
      const parsed = new URL(rawValue);
      const pathname = parsed.pathname.split(/[\\/]/).filter(Boolean).pop();
      return pathname || parsed.hostname || rawValue;
    }
  } catch {
    // Fall through to path splitting for non-standard source strings.
  }

  return rawValue.split(/[\\/]/).filter(Boolean).pop() || rawValue;
}

function getFileExtension(fileName) {
  const match = String(fileName || "").match(/\.([a-z0-9]+)$/i);
  return match ? match[1].toLowerCase() : "chroma";
}

function normalizePageNumber(value) {
  const pageNumber = Number(value);
  return Number.isFinite(pageNumber) && pageNumber > 0 ? Math.floor(pageNumber) : null;
}

function getChunkText(document, metadata) {
  const documentText = String(document || "").trim();
  if (documentText) return documentText;

  return metadataValue(metadata, TEXT_METADATA_KEYS);
}

function normalizeChunkRecord(id, document, metadata, index) {
  const rawMetadata = metadata && typeof metadata === "object" ? metadata : {};
  const sourceValue = metadataValue(rawMetadata, SOURCE_METADATA_KEYS);
  const fileName = basenameFromSource(sourceValue) || `chroma_record_${String(index + 1)}`;
  const sourcePath = metadataValue(rawMetadata, ["source_path", "path", "source", "url"]);
  const pageNumber = normalizePageNumber(rawMetadata.page_number || rawMetadata.page || rawMetadata.pageIndex);
  const chunkId = String(rawMetadata.chunk_id || rawMetadata.chunkId || id || `chunk_${index + 1}`);
  const normalizedMetadata = {
    ...rawMetadata,
    file_name: String(rawMetadata.file_name || rawMetadata.filename || fileName),
    chunk_id: chunkId,
    extraction_method:
      rawMetadata.extraction_method ||
      rawMetadata.extractionMethod ||
      (isExternalChromaSource ? "n8n_chroma_source" : "chroma_record"),
    source_path: sourcePath || rawMetadata.source_path || ""
  };

  if (pageNumber) {
    normalizedMetadata.page_number = pageNumber;
  }

  return {
    id: String(id || chunkId),
    text: getChunkText(document, normalizedMetadata),
    metadata: normalizedMetadata
  };
}

function normalizeVectorResults(results) {
  const ids = results?.ids?.[0] || [];
  const documents = results?.documents?.[0] || [];
  const metadatas = results?.metadatas?.[0] || [];
  const distances = results?.distances?.[0] || [];

  return ids
    .map((id, index) => {
      const chunk = normalizeChunkRecord(id, documents[index], metadatas[index], index);
      return {
        ...chunk,
        score: Number.isFinite(distances[index]) ? 1 / (1 + distances[index]) : 0
      };
    })
    .filter((chunk) => chunk.text);
}

function reciprocalRankFusion(resultGroups, limit = FINAL_CONTEXT_RESULTS) {
  const fused = new Map();
  const k = 60;

  for (const group of resultGroups) {
    group.forEach((item, index) => {
      const existing = fused.get(item.id) || {
        ...item,
        rrfScore: 0,
        origins: new Set()
      };
      existing.rrfScore += 1 / (k + index + 1);
      if (item.origin) existing.origins.add(item.origin);
      existing.score = Math.max(existing.score || 0, item.score || 0);
      fused.set(item.id, existing);
    });
  }

  return Array.from(fused.values())
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .slice(0, limit)
    .map((item) => ({
      ...item,
      search_origin: Array.from(item.origins || []).join(" + ") || item.origin || "hybrid",
      origins: undefined
    }));
}

async function readDocumentCollectionRecords({ includeDocuments = true, limit } = {}) {
  const collection = await getDocumentCollection();
  const count = await collection.count();
  const maxRows = Math.min(count, limit ?? getCollectionScanLimit());
  const batchSize = getCollectionScanBatchSize();
  const records = [];

  for (let offset = 0; offset < maxRows; offset += batchSize) {
    const currentLimit = Math.min(batchSize, maxRows - offset);
    const result = await collection.get({
      limit: currentLimit,
      offset,
      include: includeDocuments ? ["documents", "metadatas"] : ["metadatas"]
    });
    const ids = result.ids || [];

    ids.forEach((id, index) => {
      records.push(
        normalizeChunkRecord(
          id,
          includeDocuments ? result.documents?.[index] : "",
          result.metadatas?.[index],
          offset + index
        )
      );
    });
  }

  return {
    count,
    scannedCount: records.length,
    truncated: maxRows < count,
    records
  };
}

function summarizeCollectionRecords(records, chunkCount, scannedCount, truncated) {
  const documentsByName = new Map();

  for (const record of records) {
    const metadata = record.metadata || {};
    const fileName = metadata.file_name || record.id;
    const pageNumber = normalizePageNumber(metadata.page_number);
    const current = documentsByName.get(fileName) || {
      file_name: fileName,
      extension: getFileExtension(fileName),
      chunk_count: 0,
      extraction_method: metadata.extraction_method || "n8n_chroma_source",
      page_count: pageNumber,
      source_path: metadata.source_path || "",
      status: "parsed"
    };

    current.chunk_count += 1;
    if (metadata.extraction_method) current.extraction_method = metadata.extraction_method;
    if (metadata.source_path) current.source_path = metadata.source_path;
    if (pageNumber) current.page_count = Math.max(current.page_count || 0, pageNumber);
    documentsByName.set(fileName, current);
  }

  return {
    chunkCount,
    scannedCount,
    truncated,
    documents: Array.from(documentsByName.values()).sort((a, b) =>
      a.file_name.localeCompare(b.file_name)
    )
  };
}

export async function getExistingChromaSourceInventory() {
  const timestamp = new Date().toISOString();

  try {
    const { count, scannedCount, truncated, records } = await readDocumentCollectionRecords({
      includeDocuments: false
    });
    const inventory = summarizeCollectionRecords(records, count, scannedCount, truncated);
    const warnings = truncated
      ? [
          `Dashboard scan loaded ${scannedCount} of ${count} Chroma records. Increase CHROMA_COLLECTION_SCAN_LIMIT to inspect more rows.`
        ]
      : [];

    return {
      total_documents: inventory.documents.length,
      documents: inventory.documents,
      failures: [],
      extraction_logs: [
        {
          file_name: documentCollectionName,
          status: "synced",
          extraction_method: "existing_chroma_collection",
          chunks: count,
          scanned_chunks: scannedCount,
          warnings
        }
      ],
      indexed_at: timestamp,
      source_chunk_count: count,
      collection_name: documentCollectionName,
      truncated
    };
  } catch (error) {
    const failure = {
      file_name: documentCollectionName,
      extension: "chroma",
      source_path: documentCollectionName,
      error: error?.message || "Unable to read existing Chroma collection",
      status: "failed",
      timed_out: false,
      timeout_ms: null
    };

    return {
      total_documents: 0,
      documents: [],
      failures: [failure],
      extraction_logs: [
        {
          file_name: documentCollectionName,
          status: "failed",
          extraction_method: "existing_chroma_collection",
          chunks: 0,
          scanned_chunks: 0,
          error: failure.error
        }
      ],
      indexed_at: timestamp,
      source_chunk_count: 0,
      collection_name: documentCollectionName,
      truncated: false
    };
  }
}

export async function getDocumentCollectionInventory() {
  const { count, scannedCount, truncated, records } = await readDocumentCollectionRecords({
    includeDocuments: false
  });
  return summarizeCollectionRecords(records, count, scannedCount, truncated);
}

export async function syncExistingChromaCollection() {
  const inventory = await getExistingChromaSourceInventory();
  await hydrateKeywordCache({ force: true });

  return {
    total_documents: inventory.total_documents,
    document_count: inventory.documents.length,
    chunk_count: inventory.source_chunk_count,
    failed_count: inventory.failures.length,
    indexed_at: inventory.indexed_at,
    unparseable_or_timed_out_files: inventory.failures.map((failure) => failure.file_name),
    documents: inventory.documents,
    failures: inventory.failures,
    extraction_logs: inventory.extraction_logs,
    unparseableOrTimedOutFiles: inventory.failures.map((failure) => failure.file_name),
    source: "existing_chroma_collection",
    collection_name: documentCollectionName,
    truncated: inventory.truncated
  };
}

export async function reindexDocuments(options = {}) {
  if (isExternalChromaSource) {
    return syncExistingChromaCollection();
  }

  const parsed = await parseDocuments(options);
  const collection = await resetCollection(documentCollectionName);
  keywordCache = parsed.chunks;
  keywordCacheCollectionCount = parsed.chunks.length;

  if (parsed.chunks.length > 0) {
    const embeddings = await embedBatch(parsed.chunks.map((chunk) => chunk.text));
    await collection.add({
      ids: parsed.chunks.map((chunk) => chunk.id),
      documents: parsed.chunks.map((chunk) => chunk.text),
      metadatas: parsed.chunks.map((chunk) => chunk.metadata),
      embeddings
    });
  }

  return {
    ...parsed.stats,
    documents: parsed.documents,
    failures: parsed.failures,
    extraction_logs: parsed.extraction_logs,
    unparseableOrTimedOutFiles: parsed.stats.unparseable_or_timed_out_files
  };
}

export async function hydrateKeywordCache(options = {}) {
  if (!options.force && keywordCache.length > 0) return keywordCache;

  try {
    const { count, records } = await readDocumentCollectionRecords({ includeDocuments: true });
    keywordCacheCollectionCount = count;
    if (!count) {
      keywordCache = [];
      return [];
    }

    keywordCache = records.filter((record) => record.text);
  } catch {
    keywordCache = [];
    keywordCacheCollectionCount = 0;
  }

  return keywordCache;
}

async function queryVectorResults(query) {
  const availableCount = Math.max(keywordCacheCollectionCount, keywordCache.length);
  if (!availableCount) return [];

  const nResults = Math.min(VECTOR_RESULTS, availableCount);
  const collection = await getDocumentCollection();

  if (chromaQueryMode === "text") {
    try {
      const rawResults = await collection.query({
        queryTexts: query,
        nResults,
        include: ["documents", "metadatas", "distances"]
      });

      return normalizeVectorResults(rawResults).map((chunk) => ({
        ...chunk,
        origin: "vector_similarity"
      }));
    } catch {
      // Fall back to explicit query embeddings below.
    }
  }

  try {
    const queryEmbedding = await embedText(query);
    const rawResults = await collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults,
      include: ["documents", "metadatas", "distances"]
    });

    return normalizeVectorResults(rawResults).map((chunk) => ({
      ...chunk,
      origin: "vector_similarity"
    }));
  } catch {
    return [];
  }
}

export async function hybridSearch(query) {
  const cache = await hydrateKeywordCache();
  const keywordResults = cache
    .map((chunk) => ({ ...chunk, score: keywordScore(chunk.text, query) }))
    .filter((chunk) => chunk.score > 0)
    .map((chunk) => ({ ...chunk, origin: "keyword_match" }))
    .sort((a, b) => b.score - a.score)
    .slice(0, KEYWORD_RESULTS);

  const vectorResults = await queryVectorResults(query);

  return reciprocalRankFusion([keywordResults, vectorResults]);
}

export async function searchFeedbackExamples(query, limit = 2) {
  try {
    const collection = await getCollection(feedbackCollectionName);
    const count = await collection.count();
    if (!count) return [];

    const queryEmbedding = await embedText(query);
    const rawResults = await collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: Math.min(limit, count),
      include: ["documents", "metadatas", "distances"]
    });

    return normalizeVectorResults(rawResults).filter((item) => item.score > 0.45);
  } catch {
    return [];
  }
}
