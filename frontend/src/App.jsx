import { createContext, useCallback, useEffect, useMemo, useState } from "react";
import ChatWorkspace from "./components/ChatWorkspace.jsx";
import ContextDrawer from "./components/ContextDrawer.jsx";
import DashboardSidebar from "./components/DashboardSidebar.jsx";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
const LOCAL_REINDEX_PHASES = ["Scanning /doc...", "Extracting Layers...", "Syncing Embeddings..."];
const CHROMA_SYNC_PHASES = [
  "Reading Chroma...",
  "Hydrating retrieval cache...",
  "Syncing diagnostics..."
];

export const ThemeContext = createContext({
  theme: "dark",
  toggleTheme: () => {}
});

function apiUrl(path) {
  if (!API_BASE && import.meta.env.PROD) {
    throw new Error(
      "VITE_API_BASE_URL is not configured. Set it to your Render backend URL in Vercel."
    );
  }

  return `${API_BASE}${path}`;
}

function createThread() {
  return {
    id: crypto.randomUUID(),
    title: "New thread",
    messages: [],
    createdAt: new Date().toISOString()
  };
}

function getInitialTheme() {
  if (typeof window === "undefined") return "dark";
  return window.localStorage.getItem("recall-theme") || "dark";
}

export default function App() {
  const [threads, setThreads] = useState(() => [createThread()]);
  const [activeThreadId, setActiveThreadId] = useState(() => threads[0]?.id);
  const [dashboard, setDashboard] = useState(null);
  const [loadingDashboard, setLoadingDashboard] = useState(true);
  const [reindexing, setReindexing] = useState(false);
  const [reindexPhaseIndex, setReindexPhaseIndex] = useState(0);
  const [chatLoading, setChatLoading] = useState(false);
  const [selectedCitation, setSelectedCitation] = useState(null);
  const [theme, setTheme] = useState(getInitialTheme);
  const [error, setError] = useState("");

  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === activeThreadId) || threads[0],
    [threads, activeThreadId]
  );
  const usingChromaSource = dashboard?.data_source === "chroma";
  const reindexPhases = usingChromaSource ? CHROMA_SYNC_PHASES : LOCAL_REINDEX_PHASES;

  const themeValue = useMemo(
    () => ({
      theme,
      toggleTheme: () => setTheme((current) => (current === "dark" ? "light" : "dark"))
    }),
    [theme]
  );

  useEffect(() => {
    window.localStorage.setItem("recall-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (!reindexing) {
      setReindexPhaseIndex(0);
      return undefined;
    }

    const intervalId = setInterval(() => {
      setReindexPhaseIndex((current) => (current + 1) % reindexPhases.length);
    }, 1400);

    return () => clearInterval(intervalId);
  }, [reindexing, reindexPhases.length]);

  const updateActiveThread = useCallback(
    (updater) => {
      setThreads((currentThreads) =>
        currentThreads.map((thread) =>
          thread.id === activeThreadId ? updater(thread) : thread
        )
      );
    },
    [activeThreadId]
  );

  const fetchDashboard = useCallback(async () => {
    setLoadingDashboard(true);
    try {
      const response = await fetch(apiUrl("/api/dashboard"));
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to load dashboard");
      setDashboard(payload);
      setError("");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoadingDashboard(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  async function handleReindex() {
    setReindexing(true);
    setError("");
    try {
      const response = await fetch(apiUrl("/api/reindex"), { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to re-index documents");
      if (payload.partial_error) {
        setError(payload.message || "Index completed with file diagnostics.");
      }
      await fetchDashboard();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setReindexing(false);
    }
  }

  async function handleSendMessage(message) {
    const userMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: message,
      createdAt: new Date().toISOString()
    };

    const currentHistory = activeThread?.messages || [];
    updateActiveThread((thread) => ({
      ...thread,
      title: thread.messages.length ? thread.title : message.slice(0, 48),
      messages: [...thread.messages, userMessage]
    }));

    setChatLoading(true);
    setError("");

    try {
      const response = await fetch(apiUrl("/api/chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          history: currentHistory.map(({ role, content }) => ({ role, content }))
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to get response");

      const assistantMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: payload.answer,
        citations: payload.citations || [],
        feedbackOptimized: Boolean(payload.feedback_optimized),
        question: message,
        createdAt: new Date().toISOString()
      };

      updateActiveThread((thread) => ({
        ...thread,
        messages: [...thread.messages, assistantMessage]
      }));
    } catch (requestError) {
      updateActiveThread((thread) => ({
        ...thread,
        messages: [
          ...thread.messages,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: "The backend could not complete this request.",
            error: requestError.message,
            createdAt: new Date().toISOString()
          }
        ]
      }));
      setError(requestError.message);
    } finally {
      setChatLoading(false);
    }
  }

  async function handleFeedback(messageId, feedback) {
    const message = activeThread?.messages.find((item) => item.id === messageId);
    if (!message) return;

    const response = await fetch(apiUrl("/api/feedback"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: message.question,
        answer: message.content,
        rating: feedback.rating,
        correction: feedback.correction
      })
    });

    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Unable to store feedback");

    updateActiveThread((thread) => ({
      ...thread,
      messages: thread.messages.map((item) =>
        item.id === messageId ? { ...item, feedbackStored: payload.stored } : item
      )
    }));
    await fetchDashboard();
  }

  function handleClearHistory() {
    updateActiveThread((thread) => ({
      ...thread,
      title: "New thread",
      messages: []
    }));
    setSelectedCitation(null);
  }

  return (
    <ThemeContext.Provider value={themeValue}>
      <main className={theme === "dark" ? "dark" : ""}>
        <div className="flex h-screen overflow-hidden bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
          <DashboardSidebar
            dashboard={dashboard}
            loading={loadingDashboard}
            reindexing={reindexing}
            reindexPhase={reindexPhases[reindexPhaseIndex] || reindexPhases[0]}
            error={error}
            theme={theme}
            onToggleTheme={themeValue.toggleTheme}
            onReindex={handleReindex}
          />
          <ChatWorkspace
            thread={activeThread}
            loading={chatLoading}
            onSendMessage={handleSendMessage}
            onFeedback={handleFeedback}
            onSelectCitation={setSelectedCitation}
            onClearHistory={handleClearHistory}
          />
          <ContextDrawer citation={selectedCitation} onClose={() => setSelectedCitation(null)} />
        </div>
      </main>
    </ThemeContext.Provider>
  );
}
