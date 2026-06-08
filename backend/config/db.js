import dotenv from "dotenv";
import { ChromaClient, CloudClient } from "chromadb";

dotenv.config();

const DEFAULT_LOCAL_CHROMA_URL = "http://localhost:8000";
const DEFAULT_CHROMA_CLOUD_HOST = "https://api.trychroma.com";

function readEnv(name) {
  return String(process.env[name] || "").trim();
}

function isEnabled(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function normalizeCloudHost(value) {
  const rawValue = String(value || "").trim();
  if (!rawValue) return null;

  const withProtocol = /^https?:\/\//i.test(rawValue) ? rawValue : `https://${rawValue}`;
  const withoutTrailingSlash = withProtocol.replace(/\/+$/, "");

  try {
    const parsed = new URL(withoutTrailingSlash);
    return {
      host: `${parsed.protocol}//${parsed.hostname}`,
      port: parsed.port,
      display: `${parsed.protocol}//${parsed.host}`
    };
  } catch {
    return {
      host: withoutTrailingSlash,
      port: "",
      display: withoutTrailingSlash
    };
  }
}

const chromaUrl = readEnv("CHROMA_URL") || DEFAULT_LOCAL_CHROMA_URL;
const chromaHost = normalizeCloudHost(readEnv("CHROMA_HOST"));
const chromaCloudPort =
  readEnv("CHROMA_PORT") || readEnv("CHROMA_CLOUD_PORT") || chromaHost?.port || "";
const chromaTenant = readEnv("CHROMA_TENANT") || undefined;
const chromaDatabase = readEnv("CHROMA_DATABASE") || undefined;
const chromaApiKey = readEnv("CHROMA_API_KEY") || undefined;

export const documentCollectionName =
  process.env.DOCUMENT_COLLECTION || "document_collection";
export const feedbackCollectionName =
  process.env.FEEDBACK_COLLECTION || "feedback_collection";
export const isChromaCloud =
  Boolean(chromaApiKey) &&
  (isEnabled(process.env.CHROMA_CLOUD) ||
    Boolean(chromaHost || chromaTenant || chromaDatabase));
export const isExternalChromaSource =
  isEnabled(process.env.USE_EXISTING_CHROMA) ||
  isEnabled(process.env.EXTERNAL_CHROMA_SOURCE) ||
  ["chroma", "existing_chroma", "external_chroma"].includes(
    readEnv("RAG_SOURCE").toLowerCase()
  ) ||
  isChromaCloud;
export const chromaQueryMode = readEnv("CHROMA_QUERY_MODE").toLowerCase() || "embedding";

function createChromaClient() {
  if (isChromaCloud) {
    return new CloudClient({
      apiKey: chromaApiKey,
      tenant: chromaTenant,
      database: chromaDatabase,
      cloudHost: chromaHost?.host || DEFAULT_CHROMA_CLOUD_HOST,
      cloudPort: chromaCloudPort || undefined
    });
  }

  return new ChromaClient({
    path: chromaUrl,
    tenant: chromaTenant,
    database: chromaDatabase
  });
}

function getDisplayUrl() {
  if (!isChromaCloud) return chromaUrl;

  const hostDisplay = chromaHost?.display || DEFAULT_CHROMA_CLOUD_HOST;
  const port = chromaCloudPort || "8000";
  return hostDisplay.endsWith(`:${port}`) ? hostDisplay : `${hostDisplay}:${port}`;
}

const client = createChromaClient();

export function getChromaClient() {
  return client;
}

export async function getCollection(name, options = {}) {
  const { create = true, embeddingFunction } = options;
  if (!create) {
    return client.getCollection({ name, embeddingFunction });
  }

  return client.getOrCreateCollection({ name, embeddingFunction });
}

export async function getDocumentCollection(options = {}) {
  return getCollection(documentCollectionName, {
    ...options,
    create: isExternalChromaSource ? false : options.create !== false
  });
}

export async function resetCollection(name) {
  if (isExternalChromaSource && name === documentCollectionName) {
    throw new Error(
      `Refusing to reset external Chroma source collection "${documentCollectionName}".`
    );
  }

  try {
    await client.deleteCollection({ name });
  } catch (error) {
    const message = String(error?.message || error);
    if (!message.toLowerCase().includes("does not exist")) {
      throw error;
    }
  }
  return client.getOrCreateCollection({ name });
}

export async function countCollection(name) {
  try {
    const collection =
      name === documentCollectionName ? await getDocumentCollection() : await getCollection(name);
    return await collection.count();
  } catch {
    return 0;
  }
}

export async function getChromaStatus() {
  try {
    await client.heartbeat();
    return {
      ok: true,
      url: getDisplayUrl(),
      connection_mode: isChromaCloud ? "cloud" : "server",
      data_source: isExternalChromaSource ? "existing_chroma" : "local_documents",
      document_collection: documentCollectionName,
      feedback_collection: feedbackCollectionName,
      tenant: chromaTenant,
      database: chromaDatabase
    };
  } catch (error) {
    return {
      ok: false,
      url: getDisplayUrl(),
      connection_mode: isChromaCloud ? "cloud" : "server",
      data_source: isExternalChromaSource ? "existing_chroma" : "local_documents",
      document_collection: documentCollectionName,
      feedback_collection: feedbackCollectionName,
      tenant: chromaTenant,
      database: chromaDatabase,
      error: error?.message || "Unable to reach ChromaDB"
    };
  }
}
