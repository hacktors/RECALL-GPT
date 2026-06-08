import { Database, FileText, Hash, Layers3, Search, X } from "lucide-react";

function formatOrigin(value) {
  return String(value || "hybrid").replace(/_/g, " ");
}

function formatScore(value) {
  if (!Number.isFinite(Number(value))) return "N/A";
  return Number(value).toFixed(3);
}

function Metric({ icon: Icon, label, value }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        <Icon className="h-3.5 w-3.5 text-indigo-400" />
        {label}
      </div>
      <div className="mt-2 truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{value}</div>
    </div>
  );
}

export default function ContextDrawer({ citation, onClose }) {
  if (!citation) return null;

  const pageLabel = citation.page_number ? `Page ${citation.page_number}` : "Page N/A";

  return (
    <div className="fixed inset-0 z-30">
      <button
        type="button"
        className="absolute inset-0 bg-zinc-950/40 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close context drawer"
      />
      <aside className="absolute right-0 top-0 flex h-screen w-full flex-col border-l border-zinc-200 bg-white/95 text-zinc-900 shadow-2xl shadow-black/20 backdrop-blur-md transition-all duration-200 ease-in-out dark:border-zinc-800 dark:bg-zinc-900/95 dark:text-zinc-100 sm:w-drawer">
        <div className="border-b border-zinc-200 p-5 dark:border-zinc-800">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-400">
                Context Peek
              </p>
              <h2 className="mt-1 truncate text-lg font-semibold">{citation.file_name}</h2>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{pageLabel}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-500 transition-all duration-200 ease-in-out hover:-translate-y-0.5 hover:bg-zinc-200 hover:text-zinc-900 hover:shadow-lg dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              aria-label="Close context drawer"
              title="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-2 gap-3">
            <Metric icon={Search} label="Search Origin" value={formatOrigin(citation.search_origin)} />
            <Metric icon={Database} label="Similarity" value={formatScore(citation.similarity_score)} />
            <Metric icon={Hash} label="Chunk ID" value={citation.chunk_id || "N/A"} />
            <Metric icon={Layers3} label="Extraction" value={formatOrigin(citation.extraction_method)} />
          </div>

          <section className="mt-5 rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-center gap-2 border-b border-zinc-200 px-4 py-3 text-sm font-semibold dark:border-zinc-800">
              <FileText className="h-4 w-4 text-indigo-400" />
              Retrieved Chunk
            </div>
            <div className="p-4">
              <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-700 dark:text-zinc-200">
                {citation.text || "No chunk text was returned for this citation."}
              </p>
            </div>
          </section>

          <section className="mt-5 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Source Path
            </div>
            <div className="mt-2 break-words text-sm text-zinc-700 dark:text-zinc-300">
              {citation.source_path || "Chroma collection"}
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}
