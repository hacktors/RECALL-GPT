import {
  Activity,
  AlertCircle,
  Archive,
  Bot,
  CheckCircle2,
  Database,
  File,
  FileImage,
  FileSpreadsheet,
  FileText,
  Moon,
  Presentation,
  RefreshCw,
  Sun,
  Zap
} from "lucide-react";

const FILE_ICONS = {
  pdf: FileText,
  docx: FileText,
  txt: FileText,
  md: FileText,
  pptx: Presentation,
  xlsx: FileSpreadsheet,
  png: FileImage,
  jpg: FileImage,
  jpeg: FileImage
};

function getFileExtension(fileName, fallback) {
  if (fallback) return fallback;
  const pieces = String(fileName || "").split(".");
  return pieces.length > 1 ? pieces.pop().toLowerCase() : "file";
}

function StatusDot({ status, active }) {
  if (active) {
    return <RefreshCw className="h-4 w-4 animate-spin text-amber-400" />;
  }

  if (status === "parsed") {
    return <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-lg shadow-emerald-500/30" />;
  }

  if (status === "failed" || status === "timed_out") {
    return <AlertCircle className="h-4 w-4 text-red-500" />;
  }

  return <span className="h-2.5 w-2.5 rounded-full bg-zinc-500" />;
}

function MetricCard({ icon: Icon, label, value, accent = "text-zinc-400" }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 shadow-sm transition-all duration-200 ease-in-out hover:-translate-y-0.5 hover:shadow-lg dark:border-zinc-800 dark:bg-zinc-900/80 dark:shadow-black/20">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
          {label}
        </span>
        <Icon className={`h-4 w-4 ${accent}`} />
      </div>
      <div className="mt-3 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">{value}</div>
    </div>
  );
}

function FileTypeBadge({ extension }) {
  const normalized = String(extension || "file").toLowerCase();
  const Icon = FILE_ICONS[normalized] || File;
  const tone =
    normalized === "pdf"
      ? "border-red-500/20 bg-red-500/10 text-red-400"
      : normalized === "docx"
        ? "border-indigo-500/20 bg-indigo-500/10 text-indigo-400"
        : normalized === "xlsx"
          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
          : normalized === "pptx"
            ? "border-amber-500/20 bg-amber-500/10 text-amber-400"
            : "border-zinc-500/20 bg-zinc-500/10 text-zinc-400";

  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-1 text-xs font-semibold ${tone}`}>
      <Icon className="h-3 w-3" />
      {normalized.toUpperCase()}
    </span>
  );
}

function ReindexButton({ reindexing, phase, sourceMode, onReindex }) {
  const isChromaSource = sourceMode === "chroma";

  return (
    <button
      type="button"
      onClick={onReindex}
      disabled={reindexing}
      className="group relative w-full overflow-hidden rounded-lg border border-indigo-500/30 bg-zinc-900 px-4 py-4 text-left shadow-lg shadow-indigo-950/20 transition-all duration-200 ease-in-out hover:-translate-y-0.5 hover:border-indigo-400 hover:shadow-indigo-950/40 disabled:cursor-not-allowed dark:bg-zinc-900/80"
    >
      <div className="absolute inset-0 bg-indigo-500/10 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
      <div className="relative flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-lg border border-indigo-400/30 bg-indigo-500/10">
          {reindexing ? (
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-600 border-t-indigo-400" />
          ) : (
            <RefreshCw className="h-5 w-5 text-indigo-400" />
          )}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-zinc-100">
            {isChromaSource ? "Sync Chroma" : "Re-index Documents"}
          </span>
          <span className="mt-1 block truncate text-xs text-zinc-400">
            {reindexing
              ? phase
              : isChromaSource
                ? "Read existing vectors and metadata"
                : "Refresh vectors, OCR, and metadata"}
          </span>
        </span>
      </div>
    </button>
  );
}

export default function DashboardSidebar({
  dashboard,
  loading,
  reindexing,
  reindexPhase,
  error,
  theme,
  onToggleTheme,
  onReindex
}) {
  const chromaOk = Boolean(dashboard?.chromadb?.ok);
  const isChromaSource = dashboard?.data_source === "chroma";
  const documents = dashboard?.documents || [];
  const failures = dashboard?.parse_failures || [];
  const failureNames = new Set(failures.map((failure) => failure.file_name));
  const totalDocuments = dashboard?.totalDocuments ?? dashboard?.document_count ?? 0;
  const totalChunks = dashboard?.totalChunks ?? dashboard?.indexed_chunk_count ?? 0;
  const feedbackCount = dashboard?.feedback_loop_count ?? 0;

  return (
    <aside className="hidden h-screen w-80 shrink-0 flex-col border-r border-zinc-200 bg-zinc-50 text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 lg:flex">
      <div className="border-b border-zinc-200 p-5 dark:border-zinc-800">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <Bot className="h-5 w-5 text-indigo-400" />
              <span
                className={`absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full border-2 border-zinc-50 dark:border-zinc-950 ${
                  chromaOk ? "animate-pulse bg-emerald-400" : "bg-red-500"
                }`}
              />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold tracking-tight">RECALL GPT</h1>
              <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                ChromaDB {chromaOk ? "online" : "offline"}
                {isChromaSource && dashboard?.collection_name
                  ? ` - ${dashboard.collection_name}`
                  : ""}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onToggleTheme}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 transition-all duration-200 ease-in-out hover:-translate-y-0.5 hover:bg-zinc-100 hover:shadow-lg dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            aria-label="Toggle theme"
            title="Toggle theme"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>

        <div className="mt-5">
          <ReindexButton
            reindexing={reindexing}
            phase={reindexPhase}
            sourceMode={isChromaSource ? "chroma" : "local"}
            onReindex={onReindex}
          />
        </div>

        {error ? (
          <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
            {error}
          </div>
        ) : null}
      </div>

      <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto p-5">
        <div className="grid grid-cols-2 gap-3">
          <MetricCard
            icon={Archive}
            label="Documents"
            value={loading ? "..." : totalDocuments}
            accent="text-emerald-400"
          />
          <MetricCard
            icon={Database}
            label="Chunks"
            value={loading ? "..." : totalChunks}
            accent="text-indigo-400"
          />
          <MetricCard
            icon={Zap}
            label="Memory"
            value={loading ? "..." : feedbackCount}
            accent="text-indigo-400"
          />
          <MetricCard
            icon={Activity}
            label="Issues"
            value={loading ? "..." : failures.length}
            accent={failures.length ? "text-red-500" : "text-emerald-400"}
          />
        </div>

        <section className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {isChromaSource ? "Chroma Roster" : "File Roster"}
            </h2>
            <span className="text-xs text-zinc-500">
              {documents.length} {isChromaSource ? "sources" : "detected"}
            </span>
          </div>

          <div className="space-y-2">
            {documents.length ? (
              documents.map((document) => {
                const extension = getFileExtension(document.file_name, document.extension);
                const broken = failureNames.has(document.file_name) || document.status === "failed";
                const active = reindexing && document.status !== "parsed" && !broken;
                const status = broken ? "failed" : document.status;

                return (
                  <div
                    key={document.file_name}
                    className="rounded-lg border border-zinc-200 bg-white p-3 transition-all duration-200 ease-in-out hover:-translate-y-0.5 hover:shadow-lg dark:border-zinc-800 dark:bg-zinc-900/80 dark:shadow-black/20"
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-1">
                        <StatusDot status={status} active={active} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">{document.file_name}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <FileTypeBadge extension={extension} />
                          <span className="text-xs text-zinc-500">
                            {document.chunk_count ?? 0} chunks
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-4 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
                {isChromaSource
                  ? "No records found in the connected Chroma collection."
                  : "No supported files detected in /doc."}
              </div>
            )}
          </div>
        </section>

        <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/80">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            Engine Inventory
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {["PDF", "DOCX", "TXT", "MD", "PPTX", "XLSX", "PNG", "JPG"].map((item) => (
              <span
                key={item}
                className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs font-semibold text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400"
              >
                {item}
              </span>
            ))}
          </div>
        </section>
      </div>
    </aside>
  );
}
