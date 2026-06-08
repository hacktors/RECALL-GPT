import fs from "node:fs/promises";
import path from "node:path";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import { OfficeParser } from "officeparser";
import Tesseract from "tesseract.js";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "@napi-rs/canvas";
import { splitTextIntoChunks } from "../utils/textSplitter.js";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg"]);
const OFFICE_EXTENSIONS = new Set([".pptx", ".xlsx"]);
const TEXT_EXTENSIONS = new Set([".txt", ".md"]);
const SUPPORTED_EXTENSIONS = new Set([
  ...TEXT_EXTENSIONS,
  ".pdf",
  ".docx",
  ...OFFICE_EXTENSIONS,
  ...IMAGE_EXTENSIONS
]);
const PDF_MIN_TEXT_LENGTH = 50;
const PDF_MIN_TOKENS_PER_PAGE = 5;
const DEFAULT_PDF_RENDER_SCALE = 2.5;

export const docDirectory = path.resolve(process.cwd(), "doc");

let lastParseReport = null;

class FileParseTimeoutError extends Error {
  constructor(fileName, timeoutMs) {
    super(`Timed out after ${timeoutMs}ms while parsing ${fileName}`);
    this.name = "FileParseTimeoutError";
    this.code = "FILE_PARSE_TIMEOUT";
    this.status = "timed_out";
    this.timeoutMs = timeoutMs;
  }
}

function sourcePathFor(fileName) {
  return `/doc/${fileName}`;
}

function createAbortError(message = "Parsing was aborted") {
  const error = new Error(message);
  error.name = "AbortError";
  error.code = "ABORT_ERR";
  return error;
}

function throwIfAborted(signal) {
  if (signal?.aborted) {
    if (signal.reason instanceof Error) {
      throw signal.reason;
    }
    throw createAbortError();
  }
}

function createAbortPromise(signal, onAbort) {
  if (!signal) return null;
  return new Promise((_, reject) => {
    if (signal.aborted) {
      onAbort?.();
      reject(signal.reason instanceof Error ? signal.reason : createAbortError());
      return;
    }

    signal.addEventListener(
      "abort",
      () => {
        onAbort?.();
        reject(signal.reason instanceof Error ? signal.reason : createAbortError());
      },
      { once: true }
    );
  });
}

async function raceAbortable(promise, signal, onAbort) {
  const abortPromise = createAbortPromise(signal, onAbort);
  if (!abortPromise) return promise;
  return Promise.race([promise, abortPromise]);
}

function withFileTimeout(fileName, timeoutMs, parser) {
  if (!timeoutMs || timeoutMs <= 0) {
    return parser();
  }

  const abortController = new AbortController();
  let timeoutId;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      const timeoutError = new FileParseTimeoutError(fileName, timeoutMs);
      reject(timeoutError);
      abortController.abort(timeoutError);
    }, timeoutMs);
  });

  return Promise.race([parser(abortController.signal), timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
}

function normalizeWhitespace(rawText) {
  return String(rawText || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\u00A0/g, " ");
}

function cleanupLine(line, aggressiveOcr = false) {
  let cleaned = line.replace(/[^\S\n]+/g, " ").trim();
  if (!cleaned) return "";

  if (aggressiveOcr) {
    cleaned = cleaned
      .replace(/^[|¦!~`'".,;:_[\](){}<>\\/-]+\s*/g, "")
      .replace(/\s*[|¦!~`'".,;:_[\](){}<>\\/-]+$/g, "")
      .replace(/\s*\|\s*/g, " ")
      .replace(/[□■▪▫▯▮▰▱◆◇○●◦]+/g, " ")
      .replace(/([A-Za-z])\s+(?=[A-Za-z]\s+(?:[A-Za-z]\s*){2,}$)/g, "$1")
      .replace(/\s{2,}/g, " ")
      .trim();

    if (/^[^\p{L}\p{N}]{1,6}$/u.test(cleaned)) return "";
    if (/^[A-Za-z]$/.test(cleaned)) return "";
    if (/^(?:[A-Za-z]\s+){2,}[A-Za-z]$/.test(cleaned)) {
      cleaned = cleaned.replace(/\s+/g, "");
    }
  }

  return cleaned;
}

export function cleanText(rawText, options = {}) {
  const aggressiveOcr = Boolean(options.aggressiveOcr);
  const normalized = normalizeWhitespace(rawText);
  const paragraphs = normalized.split(/\n{2,}/);
  const cleanedParagraphs = paragraphs
    .map((paragraph) =>
      paragraph
        .split("\n")
        .map((line) => cleanupLine(line, aggressiveOcr))
        .filter(Boolean)
        .join("\n")
        .trim()
    )
    .filter(Boolean);

  return cleanedParagraphs.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

function countTokens(text) {
  return String(text || "")
    .split(/\s+/)
    .map((token) => token.replace(/[^\p{L}\p{N}_-]/gu, ""))
    .filter(Boolean).length;
}

function createTextSection(text, pageNumber = null, label = null) {
  return {
    text,
    pageNumber,
    label
  };
}

function normalizeOfficeMessages(...messageGroups) {
  return messageGroups
    .flat()
    .filter(Boolean)
    .map((message) => {
      if (typeof message === "string") return message;
      return message.message || message.code || JSON.stringify(message);
    })
    .filter(Boolean);
}

async function readPlainText(filePath) {
  return fs.readFile(filePath, "utf8");
}

async function readDocx(filePath) {
  const parsed = await mammoth.extractRawText({ path: filePath });
  return {
    text: parsed.value,
    warnings: normalizeOfficeMessages(parsed.messages)
  };
}

async function readOffice(filePath, extension, signal) {
  const warnings = [];
  const ast = await OfficeParser.parseOffice(filePath, {
    fileType: extension.slice(1),
    newlineDelimiter: "\n\n",
    abortSignal: signal,
    onWarning: (issue) => warnings.push(issue)
  });

  const converted = ast?.to
    ? await ast.to("text", { newlineDelimiter: "\n\n" })
    : { value: ast?.toText?.() || "" };

  return {
    text: converted?.value || "",
    warnings: normalizeOfficeMessages(ast?.warnings, converted?.messages, warnings)
  };
}

async function recognizeBufferWithWorker(imageBuffer, signal) {
  let worker;
  try {
    const workerPromise = Tesseract.createWorker("eng", 1);
    worker = await raceAbortable(workerPromise, signal, () => {
      workerPromise.then((lateWorker) => lateWorker.terminate()).catch(() => {});
    });
    await raceAbortable(
      worker.setParameters({
        preserve_interword_spaces: "1",
        user_defined_dpi: "300"
      }),
      signal
    );

    const result = await raceAbortable(worker.recognize(imageBuffer), signal, () => {
      worker?.terminate().catch(() => {});
    });

    return result?.data?.text || "";
  } finally {
    if (worker) {
      await worker.terminate().catch(() => {});
    }
  }
}

async function recognizeImage(fileBuffer, signal) {
  if (signal) {
    return recognizeBufferWithWorker(fileBuffer, signal);
  }

  const {
    data: { text }
  } = await Tesseract.recognize(fileBuffer, "eng");
  return text;
}

function isScannedPdf(cleanedText, pageCount) {
  const safePageCount = Math.max(1, Number(pageCount) || 1);
  const averageTokensPerPage = countTokens(cleanedText) / safePageCount;
  return cleanedText.length < PDF_MIN_TEXT_LENGTH || averageTokensPerPage < PDF_MIN_TOKENS_PER_PAGE;
}

async function renderPdfPageToPng(page, scale, signal) {
  const viewport = page.getViewport({ scale });
  const width = Math.ceil(viewport.width);
  const height = Math.ceil(viewport.height);
  const canvas = createCanvas(width, height);
  const canvasContext = canvas.getContext("2d");

  canvasContext.fillStyle = "#ffffff";
  canvasContext.fillRect(0, 0, width, height);

  const renderTask = page.render({
    canvasContext,
    viewport
  });

  await raceAbortable(renderTask.promise, signal, () => renderTask.cancel());

  const png = await canvas.encode("png");
  return Buffer.from(png);
}

async function ocrPdfPages(fileBuffer, signal) {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(fileBuffer),
    disableWorker: true,
    useSystemFonts: true
  });
  const pdfDocument = await raceAbortable(loadingTask.promise, signal, () =>
    loadingTask.destroy?.()
  );
  const scale = Number(process.env.PDF_OCR_RENDER_SCALE || DEFAULT_PDF_RENDER_SCALE);
  const pageCount = pdfDocument.numPages;
  const sections = [];

  try {
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      throwIfAborted(signal);
      const page = await raceAbortable(pdfDocument.getPage(pageNumber), signal);

      try {
        const pageImageBuffer = await renderPdfPageToPng(page, scale, signal);
        const pageText = await recognizeBufferWithWorker(pageImageBuffer, signal);
        const cleaned = cleanText(pageText, { aggressiveOcr: true });
        const textWithBoundary = `--- PAGE ${pageNumber} ---${cleaned ? `\n${cleaned}` : ""}`;
        sections.push(createTextSection(textWithBoundary, pageNumber, `PAGE ${pageNumber}`));
      } finally {
        page.cleanup?.();
      }
    }
  } finally {
    await pdfDocument.cleanup?.();
    await pdfDocument.destroy?.();
  }

  return {
    pageCount,
    sections
  };
}

async function readPdf(filePath, signal, allowOcr = true) {
  const fileBuffer = await fs.readFile(filePath);
  const parsed = await raceAbortable(pdfParse(fileBuffer), signal);
  const pageCount = parsed?.numpages || 1;
  const cleanedText = cleanText(parsed?.text || "");

  if (!isScannedPdf(cleanedText, pageCount)) {
    return {
      extractionMethod: "pdf_parse_text",
      pageCount,
      sections: [createTextSection(cleanedText)],
      warnings: []
    };
  }

  if (!allowOcr) {
    const error = new Error("PDF appears scanned/image-based and OCR is disabled for this request.");
    error.code = "OCR_DISABLED";
    throw error;
  }

  const ocrResult = await ocrPdfPages(fileBuffer, signal);
  return {
    extractionMethod: "tesseract_ocr_fallback",
    pageCount: ocrResult.pageCount,
    sections: ocrResult.sections,
    warnings: [
      `pdf-parse returned ${cleanedText.length} characters across ${pageCount} page(s); OCR fallback was used.`
    ]
  };
}

async function parseDocumentFile(filePath, fileName, extension, options = {}) {
  const signal = options.signal;
  const allowOcr = options.allowOcr !== false;
  const startedAt = Date.now();
  throwIfAborted(signal);

  if (TEXT_EXTENSIONS.has(extension)) {
    const rawText = await readPlainText(filePath);
    const text = cleanText(rawText);
    return {
      fileName,
      extension,
      extractionMethod: "plain_text",
      sections: [createTextSection(text)],
      pageCount: null,
      warnings: [],
      durationMs: Date.now() - startedAt
    };
  }

  if (extension === ".docx") {
    const parsed = await readDocx(filePath);
    const text = cleanText(parsed.text);
    return {
      fileName,
      extension,
      extractionMethod: "mammoth_docx",
      sections: [createTextSection(text)],
      pageCount: null,
      warnings: parsed.warnings,
      durationMs: Date.now() - startedAt
    };
  }

  if (OFFICE_EXTENSIONS.has(extension)) {
    const parsed = await readOffice(filePath, extension, signal);
    const text = cleanText(parsed.text);
    return {
      fileName,
      extension,
      extractionMethod: `officeparser_${extension.slice(1)}`,
      sections: [createTextSection(text)],
      pageCount: null,
      warnings: parsed.warnings,
      durationMs: Date.now() - startedAt
    };
  }

  if (IMAGE_EXTENSIONS.has(extension)) {
    if (!allowOcr) {
      const error = new Error("Image OCR is disabled for this request.");
      error.code = "OCR_DISABLED";
      throw error;
    }

    const fileBuffer = await fs.readFile(filePath);
    const text = await recognizeImage(fileBuffer, signal);
    const cleaned = cleanText(text, { aggressiveOcr: true });
    return {
      fileName,
      extension,
      extractionMethod: "tesseract_ocr_image",
      sections: [createTextSection(cleaned)],
      pageCount: null,
      warnings: [],
      durationMs: Date.now() - startedAt
    };
  }

  if (extension === ".pdf") {
    const parsed = await readPdf(filePath, signal, allowOcr);
    return {
      fileName,
      extension,
      extractionMethod: parsed.extractionMethod,
      sections: parsed.sections,
      pageCount: parsed.pageCount,
      warnings: parsed.warnings,
      durationMs: Date.now() - startedAt
    };
  }

  const error = new Error(`Unsupported file extension: ${extension}`);
  error.code = "UNSUPPORTED_FILE";
  throw error;
}

async function listSupportedFiles() {
  await fs.mkdir(docDirectory, { recursive: true });
  const entries = await fs.readdir(docDirectory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((fileName) => SUPPORTED_EXTENSIONS.has(path.extname(fileName).toLowerCase()))
    .sort((a, b) => a.localeCompare(b));
}

function buildDocumentRecord(fileName, extension, parsed, cleanedText, fileChunks) {
  return {
    file_name: fileName,
    extension: extension.replace(".", ""),
    chunk_count: fileChunks.length,
    characters: cleanedText.length,
    extraction_method: parsed.extractionMethod,
    page_count: parsed.pageCount,
    source_path: sourcePathFor(fileName),
    duration_ms: parsed.durationMs,
    warnings: parsed.warnings || [],
    status: "parsed"
  };
}

function createChunkMetadata(fileName, parsed, section, chunkIndex, totalChunks, timestamp) {
  const metadata = {
    file_name: fileName,
    chunk_id: `chunk_${String(chunkIndex + 1).padStart(3, "0")}`,
    total_chunks: String(totalChunks),
    extraction_method: parsed.extractionMethod,
    source_path: sourcePathFor(fileName),
    timestamp
  };

  if (Number.isInteger(section.pageNumber)) {
    metadata.page_number = section.pageNumber;
  }

  return metadata;
}

function buildFailure(fileName, extension, error, timeoutMs = null) {
  const timedOut =
    error instanceof FileParseTimeoutError ||
    error?.code === "FILE_PARSE_TIMEOUT" ||
    error?.name === "AbortError";

  return {
    file_name: fileName,
    extension: extension.replace(".", ""),
    source_path: sourcePathFor(fileName),
    error: error?.message || "Unable to parse document",
    status: timedOut ? "timed_out" : "failed",
    timed_out: timedOut,
    timeout_ms: timedOut ? error?.timeoutMs || timeoutMs : null
  };
}

export function getLastParseReport() {
  return lastParseReport;
}

export async function inspectDocumentSources() {
  const files = await listSupportedFiles();
  const report = lastParseReport;
  const documentByName = new Map((report?.documents || []).map((document) => [document.file_name, document]));
  const failureByName = new Map((report?.failures || []).map((failure) => [failure.file_name, failure]));

  const documents = files.map((fileName) => {
    const extension = path.extname(fileName).toLowerCase().replace(".", "");
    if (documentByName.has(fileName)) return documentByName.get(fileName);
    if (failureByName.has(fileName)) {
      const failure = failureByName.get(fileName);
      return {
        file_name: fileName,
        extension,
        chunk_count: 0,
        characters: 0,
        extraction_method: failure.timed_out ? "timed_out" : "failed",
        source_path: sourcePathFor(fileName),
        status: failure.status
      };
    }

    return {
      file_name: fileName,
      extension,
      chunk_count: 0,
      characters: 0,
      extraction_method: "not_indexed",
      source_path: sourcePathFor(fileName),
      status: "pending"
    };
  });

  return {
    total_documents: files.length,
    documents,
    failures: report?.failures || [],
    extraction_logs: report?.extraction_logs || [],
    indexed_at: report?.stats?.indexed_at || null,
    source_chunk_count: report?.stats?.chunk_count || 0
  };
}

export async function parseDocuments(options = {}) {
  const fileTimeoutMs = Number(options.fileTimeoutMs || 0);
  const allowOcr = options.allowOcr !== false;
  const collectChunks = options.collectChunks !== false;
  const updateLastReport = options.updateLastReport !== false;
  const files = await listSupportedFiles();
  const timestamp = new Date().toISOString();
  const chunks = [];
  const documents = [];
  const failures = [];
  const extractionLogs = [];

  for (const fileName of files) {
    const extension = path.extname(fileName).toLowerCase();
    const filePath = path.join(docDirectory, fileName);

    try {
      const parsed = await withFileTimeout(fileName, fileTimeoutMs, (signal) =>
        parseDocumentFile(filePath, fileName, extension, {
          signal,
          allowOcr
        })
      );

      const cleanedSections = parsed.sections
        .map((section) => ({
          ...section,
          text: cleanText(section.text, {
            aggressiveOcr: parsed.extractionMethod.startsWith("tesseract")
          })
        }))
        .filter((section) => section.text);
      const cleanedText = cleanedSections.map((section) => section.text).join("\n\n");
      const fileChunks = [];

      if (collectChunks) {
        for (const section of cleanedSections) {
          const sectionChunks = splitTextIntoChunks(section.text);
          for (const content of sectionChunks) {
            fileChunks.push({
              content,
              section
            });
          }
        }
      }

      const documentRecord = buildDocumentRecord(
        fileName,
        extension,
        parsed,
        cleanedText,
        fileChunks
      );
      documents.push(documentRecord);

      extractionLogs.push({
        file_name: fileName,
        status: "parsed",
        extraction_method: parsed.extractionMethod,
        chunks: fileChunks.length,
        characters: cleanedText.length,
        page_count: parsed.pageCount,
        duration_ms: parsed.durationMs,
        warnings: parsed.warnings || []
      });

      if (collectChunks) {
        fileChunks.forEach((chunk, index) => {
          chunks.push({
            id: `${fileName.replace(/[^a-zA-Z0-9_-]/g, "_")}::${index + 1}`,
            text: chunk.content,
            metadata: createChunkMetadata(
              fileName,
              parsed,
              chunk.section,
              index,
              fileChunks.length,
              timestamp
            )
          });
        });
      }
    } catch (error) {
      const failure = buildFailure(fileName, extension, error, fileTimeoutMs);
      failures.push(failure);
      extractionLogs.push({
        file_name: fileName,
        status: failure.status,
        extraction_method: failure.timed_out ? "timeout" : "parse_failed",
        chunks: 0,
        characters: 0,
        page_count: null,
        duration_ms: null,
        error: failure.error
      });
    }
  }

  const report = {
    documents,
    failures,
    extraction_logs: extractionLogs,
    chunks,
    stats: {
      total_documents: files.length,
      document_count: documents.length,
      chunk_count: chunks.length,
      failed_count: failures.length,
      indexed_at: timestamp,
      unparseable_or_timed_out_files: failures.map((failure) => failure.file_name)
    }
  };

  if (updateLastReport) {
    lastParseReport = report;
  }

  return report;
}
