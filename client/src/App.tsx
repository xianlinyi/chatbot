import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { fetchAgentInfo, sendMessage } from "./api.js";
import type { AgentInfoResponse, ChatMessage } from "./types.js";

export function App() {
  const [agentInfo, setAgentInfo] = useState<AgentInfoResponse | undefined>();
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isFlashing, setIsFlashing] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== "undefined") {
      return document.documentElement.classList.contains('dark') || window.matchMatchMedia?.('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  useEffect(() => {
    const controller = new AbortController();

    void fetchAgentInfo(controller.signal)
      .then((info) => {
        setAgentInfo(info);
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) {
          setError(caught instanceof Error ? caught.message : "Unable to initialize chat.");
        }
      });

    return () => {
      controller.abort();
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const subtitle = useMemo(() => {
    if (!agentInfo) {
      return "Starting local agent";
    }

    return `${agentInfo.agent.provider} · ${agentInfo.agent.model} · ${agentInfo.agent.auth.mode}`;
  }, [agentInfo]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prompt = draft.trim();
    if (!prompt) {
      setIsFlashing(true);
      setTimeout(() => setIsFlashing(false), 500);
      return;
    }
    if (isSending) {
      return;
    }

    const assistantId = crypto.randomUUID();
    setError(undefined);
    setDraft("");
    setIsSending(true);
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", content: prompt },
      { id: assistantId, role: "assistant", content: "", status: "streaming" }
    ]);

    try {
      for await (const event of sendMessage(sessionId, prompt)) {
        if (event.type === "session") {
          setSessionId(event.sessionId);
        }

        if (event.type === "delta") {
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantId ? { ...message, content: message.content + event.content } : message
            )
          );
        }

        if (event.type === "error") {
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantId ? { ...message, content: event.message, status: "error" } : message
            )
          );
        }

        if (event.type === "done") {
          setMessages((current) =>
            current.map((message) => (message.id === assistantId ? { ...message, status: "done" } : message))
          );
        }
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Unable to send message.";
      setError(message);
      setMessages((current) =>
        current.map((item) => (item.id === assistantId ? { ...item, content: message, status: "error" } : item))
      );
    } finally {
      setIsSending(false);
    }
  }

  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content).catch(() => {});
  };

  return (
    <div className="app-container">
      <aside className="sidebar">
        <header className="brand-panel" aria-label="Chatbot identity">
          <div className="brand-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" role="img" aria-label="GitHub icon" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
          </div>
          <div>
            <h1>James.bot</h1>
          </div>
        </header>

        <div className="sidebar-tips">
          <h3>提示信息</h3>
          <ul>
            <li>✨ 你可以让我帮忙查数据库里的信息</li>
            <li>💡 你可以让我解释复杂的代码逻辑</li>
            <li>🐛 可以把报错信息粘贴给我来找 Bug</li>
          </ul>
        </div>
      </aside>

      <main className="shell">
        <header className="shell-header" aria-label="Chat controls">
          <label className="theme-toggle-switch" aria-label="Toggle dark mode">
            <input 
              type="checkbox" 
              checked={isDarkMode} 
              onChange={() => setIsDarkMode(!isDarkMode)} 
            />
            <span className="slider">
              <span className="slider-icon sun"><SunIcon /></span>
              <span className="slider-icon moon"><MoonIcon /></span>
              <span className="knob"></span>
            </span>
          </label>
        </header>

        <section className="conversation" aria-label="Conversation">
        <div className="message-list">
          {messages.map((message) => (
            <article className={`message ${message.role}`} key={message.id}>
              <div className="message-inner">
                <div className="message-header">
                  <div className="message-meta">{message.role === 'assistant' && (agentInfo?.app.name ?? 'Agent')}</div>
                </div>
                <div className="message-content">
                  {message.content ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                  ) : (
                    message.status === "streaming" ? <p>Thinking...</p> : null
                  )}
                </div>
                {message.content && (
                  <button 
                    className="copy-button" 
                    onClick={() => handleCopy(message.content)}
                    aria-label="Copy message"
                    title="Copy"
                  >
                    <CopyIcon />
                  </button>
                )}
              </div>
            </article>
          ))}
          <div className="chat-spacer" ref={bottomRef} />
        </div>
      </section>

      <div className="composer-container">
        <form className={`composer ${isFlashing ? "flash" : ""}`} onSubmit={handleSubmit}>
          {error ? <div className="error-banner">{error}</div> : null}
          <div className="composer-inner">
            <textarea
              aria-label="Message"
              value={draft}
              placeholder="有问题，尽管问"
              disabled={isSending}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
          </div>
          <div className="composer-actions">
            <div className="composer-hints">
              <span className="composer-hint" title="Subtitle Info">
                {subtitle}
              </span>
              {(agentInfo?.agent.skillDirectories?.length ?? 0) > 0 && (
                <span className="composer-hint" title="Skills Enabled">
                  {agentInfo?.agent.skillDirectories?.length} Skills
                </span>
              )}
              {agentInfo?.agent.instructions && (
                <span className="composer-hint" title="Instructions Applied">
                  Instructions
                </span>
              )}
            </div>
            <button type="submit" aria-label="Send message" className="send-button">
              <SendIcon />
            </button>
          </div>
        </form>
      </div>
      </main>
    </div>
  );
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 48 48" role="img" aria-label="Chatbot icon">
      <path d="M24 4l4.8 12.2L42 21l-13.2 4.8L24 38l-4.8-12.2L6 21l13.2-4.8L24 4z" />
      <circle cx="34" cy="35" r="5" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" role="img" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" role="img" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3.4 20.4 21 12 3.4 3.6 5 10.5l8.5 1.5L5 13.5l-1.6 6.9z" />
    </svg>
  );
}
