import { FormEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  answerElicitation,
  answerUserInput,
  enqueuePrompt,
  fetchAgentInfo,
  sendMessage,
  stopSession,
  stopSessionOnPageExit
} from "./api.js";
import type {
  AgentInfoResponse,
  ChatDisplayEvent,
  ChatMessage,
  ElicitationFieldValue,
  ElicitationRequest,
  ElicitationResult,
  ElicitationSchemaField,
  InputRequest
} from "./types.js";
import { areBooleanRecordsEqual, displayEventTypeFor } from "./chat/displayEvents.js";
import {
  addTokenUsage,
  EMPTY_TOKEN_USAGE,
  formatTokenUsage,
  tokenUsageFromEvent,
  usageEventKey
} from "./chat/tokenUsage.js";
import type { TokenUsage } from "./chat/tokenUsage.js";
import { ChatHeader } from "./components/ChatHeader";
import { DotPulseBackdrop } from "./components/DotPulseBackdrop";
import { PlusIcon, SendIcon, StopIcon } from "./components/icons.js";
import { LiquidGlassInput } from "./components/LiquidGlassInput";
import { MessageList } from "./components/MessageList";

const USER_MESSAGE_COLLAPSED_HEIGHT = 168;
const WELCOME_TRANSITION_MS = 720;
const CHAT_CLEAR_ANIMATION_MS = 260;

export function App() {
  const [agentInfo, setAgentInfo] = useState<AgentInfoResponse | undefined>();
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [pendingInputRequest, setPendingInputRequest] = useState<InputRequest | undefined>();
  const [pendingElicitationRequest, setPendingElicitationRequest] = useState<ElicitationRequest | undefined>();
  const [answeredInputRequestIds, setAnsweredInputRequestIds] = useState<Set<string>>(() => new Set());
  const [answeredElicitationRequestIds, setAnsweredElicitationRequestIds] = useState<Set<string>>(() => new Set());
  const [tokenUsage, setTokenUsage] = useState<TokenUsage>(EMPTY_TOKEN_USAGE);
  const [isFlashing, setIsFlashing] = useState(false);
  const [isComposerDropping, setIsComposerDropping] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [isFocused, setIsFocused] = useState(true);
  const [shortcutHint, setShortcutHint] = useState("Ctrl + /");
  const [caretState, setCaretState] = useState({ left: 8, top: 8, height: 24, visible: false });
  const [expandedUserMessages, setExpandedUserMessages] = useState<Record<string, boolean>>({});
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [overflowingUserMessages, setOverflowingUserMessages] = useState<Record<string, boolean>>({});
  const [hasEnteredChat, setHasEnteredChat] = useState(false);
  const [isClearingChat, setIsClearingChat] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== "undefined") {
      return document.documentElement.classList.contains("dark") || window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    }
    return false;
  });
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const userMessageBodyRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const activeRequestControllerRef = useRef<AbortController | undefined>(undefined);
  const activeAssistantIdRef = useRef<string | undefined>(undefined);
  const manualStopRequestedRef = useRef(false);
  const countedUsageEventsRef = useRef<Set<string>>(new Set());
  const sessionIdRef = useRef<string | undefined>(undefined);
  const composerDropTimeoutRef = useRef<number | undefined>(undefined);
  const clearChatTimeoutRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    return () => {
      if (composerDropTimeoutRef.current) {
        window.clearTimeout(composerDropTimeoutRef.current);
      }
      if (clearChatTimeoutRef.current) {
        window.clearTimeout(clearChatTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let stopped = false;
    const stopCurrentSession = () => {
      if (stopped) {
        return;
      }

      stopped = true;
      stopSessionOnPageExit(sessionIdRef.current);
    };

    window.addEventListener("pagehide", stopCurrentSession);
    window.addEventListener("beforeunload", stopCurrentSession);

    return () => {
      window.removeEventListener("pagehide", stopCurrentSession);
      window.removeEventListener("beforeunload", stopCurrentSession);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "/") {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const platform = navigator.platform ?? navigator.userAgent ?? "";
    setShortcutHint(/mac|iphone|ipad|ipod/i.test(platform) ? "⌘ + /" : "Ctrl + /");
  }, []);

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
    const labels = Array.from(
      document.querySelectorAll<HTMLElement>(".assistant-turn-label, .tool-execution-summary")
    );
    const activeLabel = labels.reverse().find((label: HTMLElement) => label.querySelector(".status-label.active"));
    const target = activeLabel ?? bottomRef.current;
    target?.scrollIntoView?.({ behavior: "smooth", block: "center" });
  }, [messages]);

  useEffect(() => {
    document.body.classList.toggle("request-active", isSending);
    return () => {
      document.body.classList.remove("request-active");
    };
  }, [isSending]);

  useLayoutEffect(() => {
    const textarea = inputRef.current;
    const mirror = mirrorRef.current;

    if (!textarea || !mirror) {
      return;
    }

    let frameId = 0;

    const syncCaret = () => {
      const selectionStart = textarea.selectionStart ?? textarea.value.length;
      const selectionEnd = textarea.selectionEnd ?? selectionStart;
      const computedStyle = window.getComputedStyle(textarea);
      const lineHeight = Number.parseFloat(computedStyle.lineHeight) || Number.parseFloat(computedStyle.fontSize) * 1.5;
      const caretHeight = Math.max(20, Math.round(lineHeight * 0.86));

      mirror.style.width = `${textarea.clientWidth}px`;
      mirror.replaceChildren();
      mirror.append(document.createTextNode(textarea.value.slice(0, selectionStart)));

      const marker = document.createElement("span");
      marker.textContent = "\u200b";
      mirror.append(marker);
      mirror.append(document.createTextNode(textarea.value.slice(selectionStart) || " "));

      const nextState = {
        left: marker.offsetLeft - textarea.scrollLeft,
        top: marker.offsetTop - textarea.scrollTop + Math.max(0, Math.floor((lineHeight - caretHeight) / 2)) - 3,
        height: caretHeight,
        visible: isFocused && selectionStart === selectionEnd
      };

      setCaretState((current) => {
        if (
          current.left === nextState.left &&
          current.top === nextState.top &&
          current.height === nextState.height &&
          current.visible === nextState.visible
        ) {
          return current;
        }

        return nextState;
      });
    };

    const scheduleSync = () => {
      cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(syncCaret);
    };

    scheduleSync();
    textarea.addEventListener("scroll", scheduleSync);
    window.addEventListener("resize", scheduleSync);

    return () => {
      cancelAnimationFrame(frameId);
      textarea.removeEventListener("scroll", scheduleSync);
      window.removeEventListener("resize", scheduleSync);
    };
  }, [draft, isFocused]);

  useEffect(() => {
    const measureOverflow = () => {
      const nextOverflowing: Record<string, boolean> = {};

      for (const message of messages) {
        if (message.role !== "user") {
          continue;
        }

        const element = userMessageBodyRefs.current[message.id];
        if (!element) {
          continue;
        }

        nextOverflowing[message.id] = element.scrollHeight > USER_MESSAGE_COLLAPSED_HEIGHT;
      }

      setOverflowingUserMessages((current) =>
        areBooleanRecordsEqual(current, nextOverflowing) ? current : nextOverflowing
      );
      setExpandedUserMessages((current) => {
        const nextExpanded = Object.fromEntries(
          Object.entries(current).filter(([id, isExpanded]) => nextOverflowing[id] && isExpanded)
        );

        return areBooleanRecordsEqual(current, nextExpanded) ? current : nextExpanded;
      });
    };

    measureOverflow();
    window.addEventListener("resize", measureOverflow);

    return () => {
      window.removeEventListener("resize", measureOverflow);
    };
  }, [messages]);

  const subtitle = useMemo(() => {
    if (!agentInfo) {
      return "Starting local agent";
    }

    return `${agentInfo.agent.provider} · ${agentInfo.agent.model} · ${agentInfo.agent.auth.mode}`;
  }, [agentInfo]);

  const tokenUsageText = useMemo(() => formatTokenUsage(tokenUsage), [tokenUsage]);
  const hasDraftText = draft.trim().length > 0;
  const showStopButton = isSending && !hasDraftText;
  const isWelcomeMode = !hasEnteredChat && messages.length === 0 && !sessionId && !isSending && !pendingInputRequest;

  async function handleStopRequest() {
    if (!isSending) {
      return;
    }

    manualStopRequestedRef.current = true;
    activeRequestControllerRef.current?.abort();
    setIsSending(false);
    setPendingInputRequest(undefined);
    setError(undefined);

    const assistantId = activeAssistantIdRef.current;
    if (assistantId) {
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content: abortContent(message.content),
                status: "done"
              }
            : message
        )
      );
    }

    try {
      await stopSession(sessionId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to stop the session.");
    } finally {
      activeRequestControllerRef.current = undefined;
      activeAssistantIdRef.current = undefined;
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  async function handleNewChat() {
    const currentSessionId = sessionIdRef.current;
    const controller = activeRequestControllerRef.current;
    const shouldAnimateClear = messages.length > 0;

    manualStopRequestedRef.current = true;
    controller?.abort();

    setSessionId(undefined);
    setDraft("");
    setIsSending(false);
    setPendingInputRequest(undefined);
    setPendingElicitationRequest(undefined);
    setAnsweredInputRequestIds(new Set());
    setAnsweredElicitationRequestIds(new Set());
    setTokenUsage(EMPTY_TOKEN_USAGE);
    setExpandedUserMessages({});
    setOverflowingUserMessages({});
    setCopiedMessageId(null);
    setError(undefined);
    setHasEnteredChat(true);
    if (clearChatTimeoutRef.current) {
      window.clearTimeout(clearChatTimeoutRef.current);
      clearChatTimeoutRef.current = undefined;
    }
    if (shouldAnimateClear) {
      setIsClearingChat(true);
      clearChatTimeoutRef.current = window.setTimeout(() => {
        setMessages([]);
        setIsClearingChat(false);
        clearChatTimeoutRef.current = undefined;
      }, CHAT_CLEAR_ANIMATION_MS);
    } else {
      setMessages([]);
      setIsClearingChat(false);
    }
    countedUsageEventsRef.current = new Set();
    activeRequestControllerRef.current = undefined;
    activeAssistantIdRef.current = undefined;

    if (!currentSessionId) {
      setTimeout(() => inputRef.current?.focus(), 0);
      return;
    }

    try {
      await stopSession(currentSessionId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to restart the chat.");
    } finally {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isClearingChat) {
      return;
    }

    const prompt = draft.trim();
    if (!prompt) {
      setIsFlashing(true);
      setTimeout(() => setIsFlashing(false), 500);
      return;
    }
    if (pendingInputRequest) {
      if (!sessionId) {
        setError("No active session for this answer.");
        return;
      }

      setError(undefined);
      setDraft("");
      setAnsweredInputRequestIds((current) => new Set(current).add(pendingInputRequest.requestId));
      try {
        await answerUserInput(sessionId, pendingInputRequest.requestId, prompt, true);
        setPendingInputRequest(undefined);
      } catch (caught) {
        setAnsweredInputRequestIds((current) => {
          const next = new Set(current);
          next.delete(pendingInputRequest.requestId);
          return next;
        });
        setError(caught instanceof Error ? caught.message : "Unable to answer Copilot.");
      }
      return;
    }

    if (isSending) {
      if (!sessionId) {
        setError("Agent session is still starting. Please try again in a moment.");
        return;
      }

      setError(undefined);
      setDraft("");
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: "user", content: prompt, isNew: true }
      ]);

      try {
        await enqueuePrompt(sessionId, prompt);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Unable to enqueue prompt.");
      } finally {
        setTimeout(() => inputRef.current?.focus(), 0);
      }
      return;
    }

    const assistantId = crypto.randomUUID();
    const requestController = new AbortController();
    const shouldKeepComposerTransparent = isWelcomeMode;
    setHasEnteredChat(true);
    manualStopRequestedRef.current = false;
    activeRequestControllerRef.current = requestController;
    activeAssistantIdRef.current = assistantId;
    setError(undefined);
    setDraft("");
    if (shouldKeepComposerTransparent) {
      setIsComposerDropping(true);
      if (composerDropTimeoutRef.current) {
        window.clearTimeout(composerDropTimeoutRef.current);
      }
      composerDropTimeoutRef.current = window.setTimeout(() => {
        setIsComposerDropping(false);
        composerDropTimeoutRef.current = undefined;
      }, WELCOME_TRANSITION_MS);
    }
    setIsSending(true);
    setIsClearingChat(false);
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", content: prompt, isNew: true },
      { id: assistantId, role: "assistant", content: "", status: "streaming", isNew: true }
    ]);

    const streamedAssistantMessageIds = new Set<string>();

    try {
      for await (const event of sendMessage(sessionId, prompt, requestController.signal)) {
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

        if (event.type === "assistant_event") {
          updateTokenUsageFromEvent(event.eventType, event.data);
          if (event.eventType === "assistant.usage") {
            continue;
          }

          let visibleText = "";
          if (event.eventType === "assistant.message_delta") {
            visibleText = typeof event.data.deltaContent === "string" ? event.data.deltaContent : "";
            const messageId = typeof event.data.messageId === "string" ? event.data.messageId : undefined;
            if (messageId) {
              streamedAssistantMessageIds.add(messageId);
            }
          } else if (event.eventType === "assistant.message") {
            const messageId = typeof event.data.messageId === "string" ? event.data.messageId : undefined;
            if (!messageId || !streamedAssistantMessageIds.has(messageId)) {
              visibleText = typeof event.data.content === "string" ? event.data.content : "";
            }
          }

          appendDisplayEvent(assistantId, {
            type: "assistant_event",
            eventType: event.eventType,
            data: event.data
          }, visibleText);
        }

        if (event.type === "copilot_event") {
          updateTokenUsageFromEvent(event.eventType, event.data);
          if (event.eventType === "assistant.usage") {
            continue;
          }

          let visibleText = "";
          if (event.eventType === "assistant.message_delta") {
            visibleText = typeof event.data.deltaContent === "string" ? event.data.deltaContent : "";
            const messageId = typeof event.data.messageId === "string" ? event.data.messageId : undefined;
            if (messageId) {
              streamedAssistantMessageIds.add(messageId);
            }
          } else if (event.eventType === "assistant.message") {
            const messageId = typeof event.data.messageId === "string" ? event.data.messageId : undefined;
            if (!messageId || !streamedAssistantMessageIds.has(messageId)) {
              visibleText = typeof event.data.content === "string" ? event.data.content : "";
            }
          }

          appendDisplayEvent(assistantId, {
            type: displayEventTypeFor(event.eventType),
            eventType: event.eventType,
            data: event.data
          }, visibleText);
        }

        if (event.type === "session_event") {
          appendDisplayEvent(assistantId, {
            type: "session_event",
            eventType: event.eventType,
            data: event.data
          });
        }

        if (event.type === "tool") {
          appendDisplayEvent(assistantId, {
            type: "tool",
            eventType: event.eventType,
            data: event.data
          });
        }

        if (event.type === "input_request") {
          const request = {
            requestId: event.requestId,
            question: event.question,
            choices: event.choices,
            allowFreeform: event.allowFreeform
          };
          setPendingInputRequest(request);
        }

        if (event.type === "elicitation_request") {
          const request = {
            requestId: event.requestId,
            message: event.message,
            requestedSchema: event.requestedSchema,
            mode: event.mode,
            elicitationSource: event.elicitationSource,
            url: event.url
          };
          setPendingElicitationRequest(request);
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
      if (manualStopRequestedRef.current || requestController.signal.aborted) {
        setMessages((current) =>
          current.map((item) =>
            item.id === assistantId
              ? {
                  ...item,
                  content: abortContent(item.content),
                  status: "done"
                }
              : item
          )
        );
        return;
      }

      const message = caught instanceof Error ? caught.message : "Unable to send message.";
      setError(message);
      setMessages((current) =>
        current.map((item) => (item.id === assistantId ? { ...item, content: message, status: "error" } : item))
      );
    } finally {
      setIsSending(false);
      if (activeRequestControllerRef.current === requestController) {
        activeRequestControllerRef.current = undefined;
      }
      if (activeAssistantIdRef.current === assistantId) {
        activeAssistantIdRef.current = undefined;
      }
      // Ensure input is focused after message is sent
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  function abortContent(content: string) {
    const trimmed = content.trimEnd();
    if (/\bAbort$/i.test(trimmed)) {
      return content;
    }

    return trimmed ? `${trimmed}\n\nAbort` : "Abort";
  }

  function appendDisplayEvent(assistantId: string, displayEvent: ChatDisplayEvent, visibleText = "") {
    setMessages((current) =>
      current.map((message) =>
        message.id === assistantId
          ? {
              ...message,
              content: visibleText ? message.content + visibleText : message.content,
              events: [...(message.events ?? []), displayEvent]
            }
          : message
      )
    );
  }

  function updateTokenUsageFromEvent(eventType: string, data: Record<string, unknown>) {
    if (eventType !== "assistant.usage") {
      return;
    }

    const usageKey = usageEventKey(data);
    if (usageKey) {
      if (countedUsageEventsRef.current.has(usageKey)) {
        return;
      }
      countedUsageEventsRef.current.add(usageKey);
    }

    const usage = tokenUsageFromEvent(data);
    if (!usage) {
      return;
    }

    setTokenUsage((current) => addTokenUsage(current, usage));
  }

  async function handleChoiceSelect(requestId: string, choice: string, wasFreeform = false) {
    if (!sessionId) {
      setError("No active session for this answer.");
      return;
    }

    if (answeredInputRequestIds.has(requestId)) {
      return;
    }

    setError(undefined);
    setAnsweredInputRequestIds((current) => new Set(current).add(requestId));

    try {
      await answerUserInput(sessionId, requestId, choice, wasFreeform);
      setPendingInputRequest((current) => (current?.requestId === requestId ? undefined : current));
    } catch (caught) {
      setAnsweredInputRequestIds((current) => {
        const next = new Set(current);
        next.delete(requestId);
        return next;
      });
      setError(caught instanceof Error ? caught.message : "Unable to answer Copilot.");
    }
  }

  async function handleElicitationResponse(requestId: string, result: ElicitationResult) {
    if (!sessionId) {
      setError("No active session for this answer.");
      return;
    }

    if (answeredElicitationRequestIds.has(requestId)) {
      return;
    }

    setError(undefined);
    setAnsweredElicitationRequestIds((current) => new Set(current).add(requestId));

    try {
      await answerElicitation(sessionId, requestId, result);
      setPendingElicitationRequest((current) => (current?.requestId === requestId ? undefined : current));
    } catch (caught) {
      setAnsweredElicitationRequestIds((current) => {
        const next = new Set(current);
        next.delete(requestId);
        return next;
      });
      setError(caught instanceof Error ? caught.message : "Unable to answer Copilot.");
    }
  }

  const handleCopy = (content: string, messageId: string) => {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedMessageId(messageId);
      setTimeout(() => setCopiedMessageId(null), 2000);
    }).catch(() => {});
  };

  const toggleUserMessageExpansion = (messageId: string) => {
    setExpandedUserMessages((current) => ({
      ...current,
      [messageId]: !current[messageId]
    }));
  };

  const handleMessageAnimationDone = (messageId: string) => {
    setMessages((current) =>
      current.map((item) => (item.id === messageId ? { ...item, isNew: false } : item))
    );
  };

  return (
    <div className="app-container">
      <DotPulseBackdrop isActive={isSending || Boolean(pendingInputRequest) || Boolean(pendingElicitationRequest)} isDarkMode={isDarkMode} />
      <main className={`shell ${isWelcomeMode ? "welcome" : "chat-active"}`}>
        <ChatHeader
          agentInfo={agentInfo}
          isWelcomeMode={isWelcomeMode}
          isDarkMode={isDarkMode}
          onDarkModeChange={setIsDarkMode}
          subtitle={subtitle}
        />

        <MessageList
          answeredInputRequestIds={answeredInputRequestIds}
          bottomRef={bottomRef}
          copiedMessageId={copiedMessageId}
          expandedUserMessages={expandedUserMessages}
          isClearing={isClearingChat}
          isDarkMode={isDarkMode}
          messages={messages}
          onAnimationDone={handleMessageAnimationDone}
          onChoiceSelect={handleChoiceSelect}
          onCopy={handleCopy}
          onToggleUserMessageExpansion={toggleUserMessageExpansion}
          overflowingUserMessages={overflowingUserMessages}
          userMessageBodyRefs={userMessageBodyRefs}
        />

        {pendingElicitationRequest ? (
          <ElicitationDialog
            request={pendingElicitationRequest}
            disabled={answeredElicitationRequestIds.has(pendingElicitationRequest.requestId)}
            onRespond={handleElicitationResponse}
          />
        ) : null}

      <div className="composer-container">
        <LiquidGlassInput
          className={`composer ${isFlashing ? "flash" : ""} ${isFocused ? "focused" : ""} ${isComposerDropping ? "composer-dropping" : ""}`}
          hasText={draft.length > 0}
          isActive={!isSending || Boolean(pendingInputRequest)}
          isDarkMode={isDarkMode}
          onSubmit={handleSubmit}
        >
          {error ? <div className="error-banner">{error}</div> : null}
          <div className="composer-inner">
            <div aria-hidden="true" className="composer-mirror" ref={mirrorRef} />
            <textarea
              ref={inputRef}
              aria-label="Message"
              value={draft}
              placeholder={pendingInputRequest ? "回答 Copilot 的问题" : isSending ? "继续补充指令" : shortcutHint}
              onChange={(event) => setDraft(event.target.value)}
              onSelect={() => {
                inputRef.current?.dispatchEvent(new Event("scroll"));
              }}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              onClick={() => {
                inputRef.current?.dispatchEvent(new Event("scroll"));
              }}
              onKeyUp={() => {
                inputRef.current?.dispatchEvent(new Event("scroll"));
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  if (showStopButton) {
                    void handleStopRequest();
                    return;
                  }

                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <span
              aria-hidden="true"
              className={`composer-caret-shell ${caretState.visible ? "visible" : ""}`}
              style={{ transform: `translate(${caretState.left}px, ${caretState.top}px)` }}
            >
              <span className="composer-caret" style={{ height: `${caretState.height}px` }} />
            </span>
          </div>
          <div className="composer-actions">
            <div className="composer-hints">
              {pendingInputRequest ? (
                <span className="composer-hint" title="Copilot is waiting for your answer">
                  Waiting for answer
                </span>
              ) : null}
              <span className="composer-hint composer-token-usage" title="Session token usage">
                {tokenUsageText}
              </span>
            </div>
            <div className="composer-action-buttons">
              <button
                type="button"
                aria-label="New chat"
                className="new-chat-button"
                onClick={handleNewChat}
                title="新聊天"
              >
                <PlusIcon />
              </button>
              <button
                type={showStopButton ? "button" : "submit"}
                aria-label={showStopButton ? "Stop response" : "Send message"}
                className={`send-button ${showStopButton ? "stop-button" : ""}`}
                onClick={showStopButton ? handleStopRequest : undefined}
                title={showStopButton ? "停止" : "发送"}
              >
                {showStopButton ? <StopIcon /> : <SendIcon />}
              </button>
            </div>
          </div>
        </LiquidGlassInput>
      </div>
      </main>
    </div>
  );
}

function ElicitationDialog({
  request,
  disabled,
  onRespond
}: {
  request: ElicitationRequest;
  disabled: boolean;
  onRespond: (requestId: string, result: ElicitationResult) => void;
}) {
  const fields = request.requestedSchema?.properties ?? {};
  const fieldEntries = Object.entries(fields);
  const required = new Set(request.requestedSchema?.required ?? []);
  const [values, setValues] = useState<Record<string, ElicitationFieldValue>>(() => initialElicitationValues(fields));
  const selectionField = fieldEntries.find(([, field]) => field.type === "string" && Array.isArray(field.enum));
  const freeformField = fields.answer?.type === "string" && !fields.answer.enum ? fields.answer : undefined;

  function setValue(key: string, value: ElicitationFieldValue) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function submit(action: ElicitationResult["action"], content?: Record<string, ElicitationFieldValue>) {
    onRespond(request.requestId, action === "accept" ? { action, content: content ?? values } : { action });
  }

  function submitSelection(key: string, value: string) {
    submit("accept", { [key]: value });
  }

  function submitField(key: string, value: ElicitationFieldValue | undefined) {
    if (value === undefined || !isSubmittableFieldValue(value)) {
      return;
    }

    submit("accept", { [key]: value });
  }

  if (request.mode === "url" && request.url) {
    return (
      <div className="elicitation-backdrop" role="presentation">
        <section aria-modal="true" className="elicitation-dialog choice-request-card waiting" role="dialog">
          <div className="choice-request-prompt">{request.elicitationSource ?? "需要用户输入"}</div>
          <div className="choice-request-question">{request.message}</div>
          <div className="choice-request-options">
            <a className="choice-request-option elicitation-link-option" href={request.url} rel="noreferrer" target="_blank">
              打开
            </a>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="elicitation-backdrop" role="presentation">
      <section aria-modal="true" className="elicitation-dialog choice-request-card waiting" role="dialog">
        <div className="choice-request-prompt">{request.elicitationSource ?? "需要用户输入"}</div>
        <div className="choice-request-question">{request.message}</div>
        <div className="elicitation-form">
          {selectionField ? (
            <div className="choice-request-options" aria-label={selectionField[1].title ?? "选项"}>
              {selectionField[1].enum?.map((option) => (
                <button
                  className="choice-request-option"
                  disabled={disabled}
                  key={option}
                  onClick={() => submitSelection(selectionField[0], option)}
                  type="button"
                >
                  {option}
                </button>
              ))}
            </div>
          ) : null}
          {fieldEntries
            .filter(([key]) => key !== selectionField?.[0])
            .map(([key, field]) => (
              <div className="elicitation-field-group" key={key}>
                {freeformField && selectionField && key === "answer" ? (
                  <div className="elicitation-divider">或输入自定义回答</div>
                ) : null}
                <ElicitationField
                  disabled={disabled}
                  field={field}
                  isRequired={required.has(key)}
                  name={key}
                  onChange={(value) => setValue(key, value)}
                  onSubmit={(value) => submitField(key, value)}
                  value={values[key]}
                />
              </div>
            ))}
          {!fieldEntries.length ? (
            <ElicitationField
              disabled={disabled}
              field={{ type: "string", title: "回答", minLength: 1 }}
              isRequired
              name="answer"
              onChange={(value) => setValue("answer", value)}
              onSubmit={(value) => submitField("answer", value)}
              value={values.answer}
            />
          ) : null}
        </div>
      </section>
    </div>
  );
}

function ElicitationField({
  name,
  field,
  value,
  isRequired,
  disabled,
  onChange,
  onSubmit
}: {
  name: string;
  field: ElicitationSchemaField;
  value: ElicitationFieldValue | undefined;
  isRequired: boolean;
  disabled: boolean;
  onChange: (value: ElicitationFieldValue) => void;
  onSubmit: (value: ElicitationFieldValue | undefined) => void;
}) {
  const label = field.title ?? name;
  const inputId = `elicitation-${name}`;
  const canSubmit = isSubmittableFieldValue(value);

  function submitInput(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(value);
  }

  if (field.type === "boolean") {
    return (
      <label className="choice-request-freeform elicitation-checkbox" htmlFor={inputId}>
        <input
          checked={Boolean(value)}
          disabled={disabled}
          id={inputId}
          onChange={(event) => {
            onChange(event.target.checked);
            onSubmit(event.target.checked);
          }}
          type="checkbox"
        />
        <span>{label}</span>
      </label>
    );
  }

  if (field.type === "number" || field.type === "integer") {
    return (
      <form className="choice-request-freeform" onSubmit={submitInput}>
        <input
          className="choice-request-freeform-input"
          disabled={disabled}
          id={inputId}
          max={field.maximum}
          min={field.minimum}
          onChange={(event) => onChange(Number(event.target.value))}
          required={isRequired}
          step={field.type === "integer" ? 1 : "any"}
          type="number"
          value={typeof value === "number" ? value : ""}
          aria-label={label}
        />
        <button
          aria-label="提交输入"
          className="choice-request-freeform-submit"
          disabled={disabled || !canSubmit}
          title="提交"
          type="submit"
        >
          <SendIcon />
        </button>
      </form>
    );
  }

  return (
    <form className="choice-request-freeform" onSubmit={submitInput}>
      <input
        className="choice-request-freeform-input"
        disabled={disabled}
        id={inputId}
        maxLength={field.maxLength}
        minLength={field.minLength}
        onChange={(event) => onChange(event.target.value)}
        placeholder="please input"
        required={isRequired}
        type="text"
        value={typeof value === "string" ? value : ""}
        aria-label={label}
      />
      <button
        aria-label="提交输入"
        className="choice-request-freeform-submit"
        disabled={disabled || !canSubmit}
        title="提交"
        type="submit"
      >
        <SendIcon />
      </button>
    </form>
  );
}

function initialElicitationValues(fields: Record<string, ElicitationSchemaField>): Record<string, ElicitationFieldValue> {
  return Object.fromEntries(
    Object.entries(fields).flatMap(([key, field]) => (field.default === undefined ? [] : [[key, field.default]]))
  );
}

function isSubmittableFieldValue(value: ElicitationFieldValue | undefined): boolean {
  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return value !== undefined;
}
