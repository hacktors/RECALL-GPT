import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Database,
  FileSearch,
  FileText,
  RefreshCw,
  Sparkles
} from "lucide-react";

function Metric({ icon: Icon, label, value, tone = "default" }) {
  const toneClass =
    tone === "ok"
      ? "border-moss/30 bg-moss/10"
      : tone === "warn"
        ? "border-amber/40 bg-amber/10"
        : "border-line bg-white";

  return (
    <div className={`min-w-0 rounded-md border px-4 py-3 ${toneClass}`}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-pine">
        <Icon className="h-4 w-4 shrink-0" />
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-semibold leading-none">{value}</div>
    </div>
  );
}

function formatMethod(value) {
  return String(value || "not_indexed").replace(/_/g, " ");
}

function formatDuration(value) {
  if (!Number.isFinite(Number(value))) return "-";
  if (value < 1000) return `${value}ms`;
  return `${(value / 1000).toFixed(1)}s`;
}

function StatusIcon({ status }) {
  if (status === "parsed") {
    return <CheckCircle2 className="h-4 w-4 text-pine" />;
  }
  if (status === "timed_out") {
    return <Clock3 className="h-4 w-4 text-amber" />;
  }
  return <AlertTriangle className="h-4 w-4 text-amber" />;
}

function ExtractionDiagnostics({ logs = [], failures = [] }) {
  if (!logs.length && !failures.length) return null;

  return (
    <div className="mt-4 rounded-md border border-line bg-white">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <FileSearch className="h-4 w-4 text-pine" />
          Extraction Diagnostics
        </div>
        <div className="text-xs font-semibold uppercase tracking-wide text-ink/60">
          {failures.length ? `${failures.length} issue${failures.length === 1 ? "" : "s"}` : "Clean"}
        </div>
      </div>
      <div className="max-h-56 overflow-y-auto">
        {logs.map((item) => (
          <div
            key={`${item.file_name}-${item.status}-${item.extraction_method}`}
            className="grid gap-2 border-b border-line px-4 py-3 text-sm last:border-b-0 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto_auto]"
          >
            <div className="flex min-w-0 items-center gap-2">
              <StatusIcon status={item.status} />
              <span className="truncate font-medium">{item.file_name}</span>
            </div>
            <div className="min-w-0 truncate text-ink/70">{formatMethod(item.extraction_method)}</div>
            <div className="text-ink/70">{item.chunks ?? 0} chunks</div>
            <div className="text-ink/70">{formatDuration(item.duration_ms)}</div>
            {item.error ? (
              <div className="md:col-span-4 rounded-md bg-amber/10 px-3 py-2 text-xs text-ink">
                {item.error}
              </div>
            ) : null}
            {item.warnings?.length ? (
              <div className="md:col-span-4 text-xs text-ink/60">
                {item.warnings.join(" ")}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard({ dashboard, loading, reindexing, error, onReindex }) {
  const chromaOk = Boolean(dashboard?.chromadb?.ok);
  const failures = dashboard?.parse_failures || [];
  const logs = dashboard?.extraction_logs || [];
  const totalDocuments = dashboard?.totalDocuments ?? dashboard?.document_count ?? 0;
  const totalChunks = dashboard?.totalChunks ?? dashboard?.indexed_chunk_count ?? 0;

  return (
    <header className="border-b border-line bg-paper px-4 py-4 lg:px-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">RECALL GPT</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink/70">
            Hybrid-search document recall with client-managed memory and adaptive feedback.
          </p>
        </div>
        <button
          type="button"
          onClick={onReindex}
          disabled={reindexing}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-pine px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-ink disabled:cursor-not-allowed disabled:opacity-70"
        >
          <RefreshCw className={`h-4 w-4 ${reindexing ? "animate-spin" : ""}`} />
          Re-index Documents
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={FileText}
          label="Total Documents"
          value={loading ? "..." : totalDocuments}
          tone={failures.length ? "warn" : "default"}
        />
        <Metric
          icon={Database}
          label="Total Chunks"
          value={loading ? "..." : totalChunks}
        />
        <Metric
          icon={Database}
          label="ChromaDB Status"
          value={loading ? "..." : chromaOk ? "Online" : "Offline"}
          tone={chromaOk ? "ok" : "warn"}
        />
        <Metric
          icon={Sparkles}
          label="Feedback Loop"
          value={loading ? "..." : dashboard?.feedback_loop_count ?? 0}
          tone="ok"
        />
      </div>

      {error ? (
        <div className="mt-3 rounded-md border border-amber/40 bg-amber/10 px-4 py-2 text-sm text-ink">
          {error}
        </div>
      ) : null}

      <ExtractionDiagnostics logs={logs} failures={failures} />
    </header>
  );
}
