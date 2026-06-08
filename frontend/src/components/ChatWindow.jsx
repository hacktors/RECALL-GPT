import { useEffect, useRef, useState } from "react";
import { Bot, Check, Send, Sparkles, ThumbsUp, UserRound } from "lucide-react";

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
      <div className="mt-3 inline-flex items-center gap-2 rounded-md border border-moss/30 bg-moss/10 px-3 py-1.5 text-xs font-semibold text-pine">
        <Check className="h-3.5 w-3.5" />
        Feedback stored
      </div>
    );
  }

  return (
    <div className="mt-3 border-t border-line pt-3">
      <textarea
        value={correction}
        onChange={(event) => setCorrection(event.target.value)}
        rows={2}
        className="w-full resize-none rounded-md border border-line bg-white px-3 py-2 text-sm outline-none transition focus:border-pine focus:ring-2 focus:ring-moss/20"
        placeholder="Optional correction for the adaptive loop"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => submitFeedback(5)}
          disabled={busy}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-pine transition hover:border-pine disabled:opacity-60"
        >
          <ThumbsUp className="h-4 w-4" />
          Useful
        </button>
        <button
          type="button"
          onClick={() => submitFeedback(2)}
          disabled={busy || !correction.trim()}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-ink transition hover:border-pine disabled:opacity-60"
        >
          <Sparkles className="h-4 w-4" />
          Teach
        </button>
        {error ? <span className="text-xs text-amber">{error}</span> : null}
      </div>
    </div>
  );
}

function Message({ message, onFeedback }) {
  const isAssistant = message.role === "assistant";

  return (
    <article className={`flex gap-3 ${isAssistant ? "" : "justify-end"}`}>
      {isAssistant ? (
        <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-pine text-white">
          <Bot className="h-5 w-5" />
        </div>
      ) : null}
      <div
        className={`max-w-3xl rounded-md border px-4 py-3 ${
          isAssistant ? "border-line bg-white" : "border-pine bg-pine text-white"
        }`}
      >
        {isAssistant && message.feedbackOptimized ? (
          <div className="mb-2 inline-flex items-center gap-2 rounded-md border border-moss/30 bg-moss/10 px-2 py-1 text-xs font-semibold text-pine">
            <Sparkles className="h-3.5 w-3.5" />
            Self-Adaptive Feedback Loop
          </div>
        ) : null}
        <p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p>
        {message.error ? <p className="mt-2 text-xs text-amber">{message.error}</p> : null}
        {isAssistant && message.citations?.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {message.citations.map((citation, index) => (
              <span
                key={`${citation.file_name}-${citation.chunk_id}-${index}`}
                className="rounded-md border border-line bg-paper px-2 py-1 text-xs text-ink/70"
              >
                {citation.file_name} #{citation.chunk_id}
              </span>
            ))}
          </div>
        ) : null}
        {isAssistant && message.question ? (
          <FeedbackPanel message={message} onFeedback={onFeedback} />
        ) : null}
      </div>
      {!isAssistant ? (
        <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-ink text-white">
          <UserRound className="h-5 w-5" />
        </div>
      ) : null}
    </article>
  );
}

export default function ChatWindow({ thread, loading, onSendMessage, onFeedback }) {
  const [draft, setDraft] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread?.messages, loading]);

  async function submit(event) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || loading) return;
    setDraft("");
    await onSendMessage(message);
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="scrollbar-slim flex-1 overflow-y-auto px-4 py-5 lg:px-8">
        <div className="mx-auto flex max-w-5xl flex-col gap-5">
          {thread?.messages?.length ? (
            thread.messages.map((message) => (
              <Message key={message.id} message={message} onFeedback={onFeedback} />
            ))
          ) : (
            <div className="rounded-md border border-line bg-white px-5 py-6">
              <h2 className="text-lg font-semibold">Ask against indexed documents</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-ink/70">
                Place source files in backend/doc, re-index, then ask grounded questions.
              </p>
            </div>
          )}
          {loading ? (
            <div className="flex items-center gap-3 text-sm text-ink/70">
              <div className="h-2 w-2 animate-pulse rounded-full bg-pine" />
              Generating grounded response
            </div>
          ) : null}
          <div ref={bottomRef} />
        </div>
      </div>

      <form onSubmit={submit} className="border-t border-line bg-white px-4 py-4 lg:px-8">
        <div className="mx-auto flex max-w-5xl gap-3">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={2}
            className="min-h-12 flex-1 resize-none rounded-md border border-line bg-paper px-4 py-3 text-sm outline-none transition focus:border-pine focus:ring-2 focus:ring-moss/20"
            placeholder="Ask a question grounded in your documents"
          />
          <button
            type="submit"
            disabled={loading || !draft.trim()}
            className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-pine text-white transition hover:bg-ink disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="Send"
            title="Send"
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
      </form>
    </section>
  );
}
