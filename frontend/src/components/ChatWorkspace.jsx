import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Bot,
  Check,
  LoaderCircle,
  MessageSquare,
  Sparkles,
  ThumbsUp,
  Trash2,
  UserRound,
  Zap
} from "lucide-react";

function AdaptiveBadge() {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1 text-xs font-semibold text-indigo-300"
      title="Past approved feedback helped shape this answer."
    >
      <Zap className="h-3.5 w-3.5" />
      ⚡ Optimized by Memory Feed
    </span>
  );
}

function FeedbackPanel({ message, onFeedback }) {
  const [correction, setCorrection] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submitFeedback(rating) {
    setBusy(true);
    setError("");
    try {
      await onFeedback(message.id, { rating, correction });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  if (message.feedbackStored) {
    return (
      <div className="mt-4 inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-400">
        <Check className="h-3.5 w-3.5" />
        Feedback stored
      </div>
    );
  }

  return (
    <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
      <textarea
        value={correction}
        onChange={(event) => setCorrection(event.target.value)}
        rows={2}
        className="w-full resize-none rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 outline-none transition-all duration-200 ease-in-out placeholder:text-zinc-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
        placeholder="Optional correction for the adaptive loop"
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => submitFeedback(5)}
          disabled={busy}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-emerald-500 transition-all duration-200 ease-in-out hover:-translate-y-0.5 hover:border-emerald-500/40 hover:shadow-lg disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <ThumbsUp className="h-4 w-4" />
          Useful
        </button>
        <button
          type="button"
          onClick={() => submitFeedback(2)}
          disabled={busy || !correction.trim()}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-indigo-400 transition-all duration-200 ease-in-out hover:-translate-y-0.5 hover:border-indigo-500/40 hover:shadow-lg disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <Sparkles className="h-4 w-4" />
          Teach
        </button>
        {error ? <span className="text-xs text-red-500">{error}</span> : null}
      </div>
    </div>
  );
}

function CitationButton({ citation, onSelect }) {
  const page = citation.page_number ? ` • Pg. ${citation.page_number}` : "";

  return (
    <button
      type="button"
      onClick={() => onSelect(citation)}
      className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600 transition-all duration-200 ease-in-out hover:-translate-y-0.5 hover:border-indigo-500/50 hover:text-indigo-500 hover:shadow-lg dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400 dark:hover:text-indigo-300"
    >
      <span className="truncate">{citation.file_name}</span>
      <span className="shrink-0">
        {page || ` • ${citation.chunk_id}`}
      </span>
    </button>
  );
}

function AssistantAvatar() {
  return (
    <div className="relative mt-1 h-11 w-11 shrink-0 rounded-xl bg-gradient-to-br from-indigo-500 to-zinc-900 p-px shadow-lg shadow-indigo-950/40">
      <div className="flex h-full w-full items-center justify-center rounded-xl bg-zinc-950">
        <Bot className="h-5 w-5 text-indigo-300" />
      </div>
      <span className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full bg-emerald-400 shadow-lg shadow-emerald-500/30" />
    </div>
  );
}

function MessageBubble({ message, onFeedback, onSelectCitation }) {
  const isAssistant = message.role === "assistant";

  if (!isAssistant) {
    return (
      <article className="flex justify-end">
        <div className="flex max-w-2xl items-start gap-3">
          <div className="rounded-2xl rounded-tr-md bg-zinc-800 px-4 py-3 text-sm leading-6 text-zinc-100 shadow-lg shadow-black/10">
            <p className="whitespace-pre-wrap">{message.content}</p>
          </div>
          <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-900 text-zinc-100">
            <UserRound className="h-4 w-4" />
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="flex gap-4">
      <AssistantAvatar />
      <div className="min-w-0 flex-1 rounded-2xl rounded-tl-md border border-zinc-200 bg-white/90 p-4 shadow-lg shadow-zinc-200/30 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/80 dark:shadow-black/20">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-semibold text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
            AI Workspace
          </span>
          {message.feedbackOptimized ? <AdaptiveBadge /> : null}
        </div>
        <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-800 dark:text-zinc-100">
          {message.content}
        </p>
        {message.error ? <p className="mt-3 text-xs text-red-500">{message.error}</p> : null}
        {message.citations?.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {message.citations.map((citation, index) => (
              <CitationButton
                key={`${citation.file_name}-${citation.chunk_id}-${index}`}
                citation={citation}
                onSelect={onSelectCitation}
              />
            ))}
          </div>
        ) : null}
        {message.question ? <FeedbackPanel message={message} onFeedback={onFeedback} /> : null}
      </div>
    </article>
  );
}

function EmptyState() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center justify-center rounded-2xl border border-zinc-200 bg-white/80 p-8 text-center shadow-lg shadow-zinc-200/30 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/80 dark:shadow-black/20">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-indigo-500/30 bg-indigo-500/10">
        <MessageSquare className="h-6 w-6 text-indigo-400" />
      </div>
      <h2 className="mt-5 text-xl font-semibold text-zinc-900 dark:text-zinc-100">
        Ready for grounded recall
      </h2>
      <p className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
        Ask a question and the workspace will retrieve the strongest indexed context.
      </p>
    </div>
  );
}

function ChatInputForm({ isLoading, onSubmitMessage, onClearHistory }) {
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  const hasContent = draft.trim().length > 0;
  const charCount = draft.length;

  function runSubmission() {
    const message = draft.trim();
    if (!message || isLoading) return;

    setDraft("");
    onSubmitMessage(message);
  }

  function handleSubmit(event) {
    event.preventDefault();
    runSubmission();
  }

  function handleKeyDown(event) {
    if (event.key !== "Enter") return;

    if (event.shiftKey) {
      return;
    }

    event.preventDefault();
    runSubmission();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border-t border-zinc-200 bg-white/80 px-4 py-4 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/80 lg:px-8"
    >
      <div
        className={`mx-auto max-w-5xl rounded-2xl border bg-zinc-50 p-3 transition-all duration-200 ease-in-out dark:bg-zinc-950 ${
          focused
            ? "border-indigo-500 shadow-sm shadow-indigo-950/20 ring-2 ring-indigo-500/20"
            : "border-zinc-200 shadow-lg shadow-zinc-200/30 dark:border-zinc-800 dark:shadow-black/20"
        }`}
      >
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          disabled={isLoading}
          rows={2}
          className="max-h-36 min-h-12 w-full resize-none bg-transparent px-2 py-2 text-sm leading-6 text-zinc-900 outline-none transition-all duration-200 ease-in-out placeholder:text-zinc-500 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-100"
          placeholder={isLoading ? "RAG engine is processing..." : "Ask a question grounded in indexed documents"}
        />
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 px-2 pt-3 dark:border-zinc-800">
          <div className="flex items-center gap-3 text-xs text-zinc-500">
            <span>{charCount} characters</span>
            <button
              type="button"
              onClick={onClearHistory}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-medium text-zinc-500 transition-all duration-200 ease-in-out hover:bg-zinc-200 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clean history
            </button>
          </div>
          <button
            type="submit"
            disabled={isLoading || !hasContent}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white transition-all duration-200 ease-in-out hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900"
            aria-label="Send"
            title="Send"
          >
            {isLoading ? (
              <span className="animate-pulse">
                <LoaderCircle className="h-5 w-5 animate-spin text-indigo-400" />
              </span>
            ) : (
              <ArrowUp
                className={`h-5 w-5 transition-all duration-200 ease-in-out ${
                  hasContent ? "text-emerald-500" : "text-zinc-500"
                }`}
              />
            )}
          </button>
        </div>
      </div>
    </form>
  );
}

export default function ChatWorkspace({
  thread,
  loading,
  onSendMessage,
  onFeedback,
  onSelectCitation,
  onClearHistory
}) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread?.messages, loading]);

  return (
    <section className="flex h-screen min-w-0 flex-1 flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="border-b border-zinc-200 bg-white/80 px-5 py-4 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/80 lg:px-8">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-400">
              Cognitive Chat Space
            </p>
            <h2 className="truncate text-lg font-semibold">{thread?.title || "New thread"}</h2>
          </div>
          <div className="hidden items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-medium text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400 sm:flex">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Retrieval ready
          </div>
        </div>
      </div>

      <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto px-4 py-6 lg:px-8">
        <div className="mx-auto flex max-w-5xl flex-col gap-6">
          {thread?.messages?.length ? (
            thread.messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                onFeedback={onFeedback}
                onSelectCitation={onSelectCitation}
              />
            ))
          ) : (
            <EmptyState />
          )}

          {loading ? (
            <div className="flex items-center gap-3 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-4 py-2 text-sm text-indigo-300">
              <span className="h-2 w-2 animate-pulse rounded-full bg-indigo-400" />
              Generating grounded response
            </div>
          ) : null}
          <div ref={bottomRef} />
        </div>
      </div>

      <ChatInputForm
        isLoading={loading}
        onSubmitMessage={onSendMessage}
        onClearHistory={onClearHistory}
      />
    </section>
  );
}
