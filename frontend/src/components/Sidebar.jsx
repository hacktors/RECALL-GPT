import { MessageSquarePlus, PanelLeft } from "lucide-react";

export default function Sidebar({ threads, activeThreadId, onSelectThread, onNewThread }) {
  return (
    <aside className="hidden w-80 shrink-0 border-r border-line bg-white lg:flex lg:flex-col">
      <div className="flex h-16 items-center justify-between border-b border-line px-4">
        <div className="flex items-center gap-2 font-semibold">
          <PanelLeft className="h-5 w-5 text-pine" />
          Sessions
        </div>
        <button
          type="button"
          onClick={onNewThread}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-line text-pine transition hover:border-pine hover:bg-moss/10"
          aria-label="New thread"
          title="New thread"
        >
          <MessageSquarePlus className="h-4 w-4" />
        </button>
      </div>
      <div className="scrollbar-slim flex-1 overflow-y-auto p-3">
        {threads.map((thread) => (
          <button
            key={thread.id}
            type="button"
            onClick={() => onSelectThread(thread.id)}
            className={`mb-2 w-full rounded-md border px-3 py-3 text-left transition ${
              thread.id === activeThreadId
                ? "border-pine bg-moss/10"
                : "border-transparent hover:border-line hover:bg-paper"
            }`}
          >
            <div className="truncate text-sm font-semibold">{thread.title}</div>
            <div className="mt-1 text-xs text-ink/60">
              {thread.messages.length} messages
            </div>
          </button>
        ))}
      </div>
    </aside>
  );
}
