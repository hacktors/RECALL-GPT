const APPROX_CHARS_PER_TOKEN = 4;

function normalizeLimit(tokens) {
  return Math.max(1, Math.floor(tokens * APPROX_CHARS_PER_TOKEN));
}

function splitBySeparator(text, separator) {
  if (separator === "") return Array.from(text);
  const pieces = text.split(separator);
  const output = [];

  for (let index = 0; index < pieces.length; index += 1) {
    const piece = pieces[index];
    if (!piece) continue;
    output.push(index < pieces.length - 1 ? `${piece}${separator}` : piece);
  }

  return output;
}

function recursiveSplit(text, maxChars, separators = ["\n\n", ". ", " ", ""]) {
  const separator = separators[0];
  if (text.length <= maxChars || separators.length === 0) return [text.trim()];

  const parts = splitBySeparator(text, separator);
  if (parts.length === 1) {
    return recursiveSplit(text, maxChars, separators.slice(1));
  }

  const chunks = [];
  let current = "";

  for (const part of parts) {
    if ((current + part).length <= maxChars) {
      current += part;
      continue;
    }

    if (current.trim()) chunks.push(current.trim());

    if (part.length > maxChars) {
      chunks.push(...recursiveSplit(part, maxChars, separators.slice(1)));
      current = "";
    } else {
      current = part;
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

export function splitTextIntoChunks(text, options = {}) {
  const chunkTokenSize = options.chunkTokenSize || 800;
  const overlapTokens = options.overlapTokens || 150;
  const maxChars = normalizeLimit(chunkTokenSize);
  const overlapChars = normalizeLimit(overlapTokens);
  const normalized = String(text || "").trim();

  if (!normalized) return [];

  const semanticChunks = recursiveSplit(normalized, maxChars);
  const overlapped = [];

  for (let index = 0; index < semanticChunks.length; index += 1) {
    const current = semanticChunks[index];
    const previous = overlapped[overlapped.length - 1] || "";
    const overlap =
      index > 0 && previous.length > overlapChars
        ? previous.slice(-overlapChars)
        : "";
    overlapped.push(`${overlap ? `${overlap}\n` : ""}${current}`.trim());
  }

  return overlapped.filter(Boolean);
}
