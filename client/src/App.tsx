import { FormEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { answerUserInput, enqueuePrompt, fetchAgentInfo, sendMessage, stopSession } from "./api.js";
import type { AgentInfoResponse, ChatDisplayEvent, ChatMessage, InputRequest } from "./types.js";
import './components/ToolExecutionBlock.css';
import { ContentRenderer } from "./components/ContentRenderer";
import { LiquidGlassInput } from "./components/LiquidGlassInput";

const USER_MESSAGE_COLLAPSED_HEIGHT = 168;
const MOCK_STREAMING_ASSISTANT_MESSAGE_ID = "mock-2";
const MOCK_STREAMING_LINE_DELAY_MS = 120;
const MOCK_STREAMING_ASSISTANT_EVENTS: ChatDisplayEvent[] = [
  createDisplayEvent("assistant_event", "assistant.turn_start", {
    turnId: 0,
    interactionId: "e7269fe1-f5a1-4851-8136-52de294f2ef8"
  }),
  createDisplayEvent("assistant_event", "assistant.message", {
    content: "",
    toolRequests: [
      {
        name: "bash",
        arguments: {
          command: "find . -type f | wc -l",
          description: "Count total number of files in the project"
        }
      }
    ],
    messageId: "1a49f7a2-3afd-47ae-9fdb-92d38e0cb840",
    outputTokens: 34,
    interactionId: "e7269fe1-f5a1-4851-8136-52de294f2ef8"
  }),
  createDisplayEvent("tool", "tool.execution_start", {
    toolCallId: "call_i5MalEr0Fhm21C9xJZrqYzV1",
    toolName: "bash",
    arguments: {
      command: "find . -type f | wc -l",
      description: "Count total number of files in the project"
    }
  }),
  createDisplayEvent("tool", "tool.execution_complete", {
    toolCallId: "call_i5MalEr0Fhm21C9xJZrqYzV1",
    model: "gpt-4.1",
    interactionId: "e7269fe1-f5a1-4851-8136-52de294f2ef8",
    success: true,
    result: {
      content: "18189\n<exited with exit code 0>",
      detailedContent: "18189\n<exited with exit code 0>"
    },
    toolTelemetry: {
      properties: {
        customTimeout: false,
        executionMode: "sync",
        detached: false
      },
      metrics: {
        commandTimeout: 30000
      }
    }
  }),
  createDisplayEvent("assistant_event", "assistant.turn_end", { turnId: 0 }),
  createDisplayEvent("assistant_event", "assistant.turn_start", {
    turnId: 1,
    interactionId: "e7269fe1-f5a1-4851-8136-52de294f2ef8"
  }),
  createDisplayEvent("assistant_event", "assistant.message", {
    content: "当前项目总文件数量为 18,189 个。",
    messageId: "621a574c-02fd-41bb-88d2-c5b612822cfe",
    outputTokens: 14,
    interactionId: "e7269fe1-f5a1-4851-8136-52de294f2ef8"
  }),
  createDisplayEvent("assistant_event", "assistant.turn_end", { turnId: 1 })
];

function createDisplayEvent(
  type: ChatDisplayEvent["type"],
  eventType: string,
  data: Record<string, unknown>
): ChatDisplayEvent {
  return { type, eventType, data };
}

function displayEventTypeFor(eventType: string): ChatDisplayEvent["type"] {
  if (eventType.startsWith("tool.")) {
    return "tool";
  }

  if (eventType.startsWith("session.")) {
    return "session_event";
  }

  return "assistant_event";
}

function areBooleanRecordsEqual(left: Record<string, boolean>, right: Record<string, boolean>) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);

  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every((key) => left[key] === right[key]);
}

type PulseDot = {
  x: number;
  y: number;
  startedAt: number;
  duration: number;
  color: [number, number, number];
};

type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

type DotWaveProps = {
  cxOffset: number;
  cyOffset: number;
  angX: number;
  angY: number;
  speedRad: number;
  speedX: number;
  speedY: number;
};

const DOT_WAVE_FADE_RATE = 0.0008;
const DOT_WAVE_CYCLE_MS = 2800;
const DOT_GRID_SIZE = 12;
const DOT_BASE_ALPHA = 0.12;
const DOT_BOTTOM_FADE_HEIGHT = 96;
const DOT_COMPOSER_CLEARANCE = 18;
const DOT_TOP_FADE_HEIGHT = 150;

function createDotWaveProps(): DotWaveProps {
  const initialAngle = Math.random() * Math.PI * 2;

  return {
    cxOffset: (Math.random() - 0.5) * 200,
    cyOffset: (Math.random() - 0.5) * 200,
    angX: Math.cos(initialAngle) * 0.012,
    angY: Math.sin(initialAngle) * 0.012,
    speedRad: 1.0 + (Math.random() - 0.5) * 0.4,
    speedX: 0.8 + (Math.random() - 0.5) * 0.3,
    speedY: 0.9 + (Math.random() - 0.5) * 0.3,
  };
}

function DotPulseBackdrop({ isActive, isDarkMode }: { isActive: boolean; isDarkMode: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const globalAlphaRef = useRef(0);
  const wavePropsRef = useRef<DotWaveProps>(createDotWaveProps());
  const finishWaveUntilRef = useRef<number | undefined>();
  const waveStartedAtRef = useRef(0);
  const wasActiveRef = useRef(isActive);

  useEffect(() => {
    if (typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent)) {
      return;
    }

    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !context) {
      return;
    }

    const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    let frameId = 0;
    let width = 0;
    let height = 0;
    let pixelRatio = 1;
    let lastTime = performance.now();

    const now = performance.now();

    if (isActive && !wasActiveRef.current) {
      wavePropsRef.current = createDotWaveProps();
      waveStartedAtRef.current = now;
    }

    if (!isActive && wasActiveRef.current) {
      const elapsed = Math.max(0, now - waveStartedAtRef.current);
      const remainingCycle = DOT_WAVE_CYCLE_MS - (elapsed % DOT_WAVE_CYCLE_MS);
      finishWaveUntilRef.current = now + remainingCycle;
    } else if (isActive) {
      if (waveStartedAtRef.current === 0) {
        waveStartedAtRef.current = now;
      }
      finishWaveUntilRef.current = undefined;
    }
    wasActiveRef.current = isActive;

    const draw = (now: number) => {
      const dt = now - lastTime;
      lastTime = now;
      const shouldFinishWave =
        !prefersReducedMotion && !isActive && finishWaveUntilRef.current !== undefined && now < finishWaveUntilRef.current;
      const shouldHoldWave = isActive || shouldFinishWave;
      const waveProps = wavePropsRef.current;

      if (shouldHoldWave && !prefersReducedMotion) {
        globalAlphaRef.current = Math.min(1, globalAlphaRef.current + dt * DOT_WAVE_FADE_RATE);
      } else {
        finishWaveUntilRef.current = undefined;
        globalAlphaRef.current = Math.max(0, globalAlphaRef.current - dt * DOT_WAVE_FADE_RATE);
      }

      context.clearRect(0, 0, width, height);

      const time = ((now - waveStartedAtRef.current) / DOT_WAVE_CYCLE_MS) * Math.PI * 2;
      const columns = Math.ceil(width / DOT_GRID_SIZE);
      const rows = Math.ceil(height / DOT_GRID_SIZE);
      const cx = width / 2 + waveProps.cxOffset;
      const cy = height / 2 + waveProps.cyOffset;
      const colorRGB = isDarkMode ? "255, 255, 255" : "0, 0, 0";
      const waveAlpha = prefersReducedMotion ? 0 : globalAlphaRef.current;
      const centerX = width / 2;
      const centerY = height / 2;
      const maxCenterDistance = Math.max(
        Math.hypot(centerX, centerY),
        Math.hypot(width - centerX, centerY),
        Math.hypot(centerX, height - centerY),
        Math.hypot(width - centerX, height - centerY),
        1
      );
      const bottomFadeStart = Math.max(0, height - DOT_COMPOSER_CLEARANCE - DOT_BOTTOM_FADE_HEIGHT);
      const bottomFadeEnd = Math.max(0, height - DOT_COMPOSER_CLEARANCE);

      for (let i = 0; i < columns; i++) {
        for (let j = 0; j < rows; j++) {
          const baseX = i * DOT_GRID_SIZE;
          const baseY = j * DOT_GRID_SIZE;

          const horizontalDistance = Math.abs(baseX - centerX) / Math.max(centerX, 1);
          const verticalDistance = Math.abs(baseY - centerY) / Math.max(centerY, 1);
          const centerDistance = Math.sqrt(horizontalDistance * horizontalDistance * 0.42 + verticalDistance * verticalDistance);
          const radialFade = Math.pow(Math.max(0, 1 - centerDistance), 0.92);
          let verticalFade = 1;
          if (baseY < DOT_TOP_FADE_HEIGHT) {
            verticalFade = Math.max(0, baseY / DOT_TOP_FADE_HEIGHT);
          } else if (baseY > bottomFadeStart) {
            verticalFade = Math.max(0, 1 - (baseY - bottomFadeStart) / Math.max(1, bottomFadeEnd - bottomFadeStart));
          }
          verticalFade *= radialFade;
          if (verticalFade <= 0.01) continue;

          const dx = baseX - cx;
          const dy = baseY - cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const radialWave = Math.sin(dist * 0.015 - time * waveProps.speedRad);
          const dirWave1 = Math.sin((dx * waveProps.angX + dy * waveProps.angY) + time * waveProps.speedX);
          const dirWave2 = Math.cos((dx * waveProps.angY - dy * waveProps.angX) + time * waveProps.speedY);
          const z = radialWave + (dirWave1 + dirWave2) * 0.5;
          const normalizedZ = Math.max(0, Math.min(1, (z + 0.2) / 2.2));
          const lift = z < -0.2 ? 0 : normalizedZ;
          const waveAmount = waveAlpha * Math.pow(lift, 1.5);
          const maxAlpha = isDarkMode ? 0.4 : 0.25;
          const alpha = (DOT_BASE_ALPHA + (maxAlpha - DOT_BASE_ALPHA) * waveAmount) * verticalFade;
          const radius = (1 + lift * 1.5 * waveAlpha) * verticalFade;

          context.beginPath();
          context.arc(baseX, baseY - lift * 4 * waveAlpha, Math.max(0.1, radius), 0, Math.PI * 2);
          context.fillStyle = `rgba(${colorRGB}, ${alpha.toFixed(3)})`;
          context.fill();
        }
      }

      if (shouldHoldWave || globalAlphaRef.current > 0) {
        frameId = window.requestAnimationFrame(draw);
      } else {
        frameId = 0;
      }
    };

    const resize = () => {
      pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.max(1, Math.round(width * pixelRatio));
      canvas.height = Math.max(1, Math.round(height * pixelRatio));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

      if (!frameId) {
        draw(performance.now());
      }
    };

    resize();
    window.addEventListener("resize", resize);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
    };
  }, [isActive, isDarkMode]);

  return <canvas aria-hidden="true" className="dot-pulse-backdrop" ref={canvasRef} />;
}

function MessageContent({ content, isDarkMode }: { content: string; isDarkMode: boolean }) {
  void isDarkMode;
  return <div className="raw-message-content">{content}</div>;
}

function MarkdownMessageContent({
  content,
  events,
  onChoiceSelect,
  answeredInputRequestIds
}: {
  content: string;
  events?: ChatDisplayEvent[];
  onChoiceSelect?: (requestId: string, choice: string) => void;
  answeredInputRequestIds?: ReadonlySet<string>;
}) {
  return (
    <ContentRenderer
      content={content}
      events={events}
      onChoiceSelect={onChoiceSelect}
      answeredInputRequestIds={answeredInputRequestIds}
    />
  );
}

export function App() {
  const [agentInfo, setAgentInfo] = useState<AgentInfoResponse | undefined>();
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "mock-1",
      role: "system",
      content: "测试显示数据"
    },
    {
      id: "mock-2",
      role: "assistant",
      content: "",
      status: "streaming"
    }
  ]);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [pendingInputRequest, setPendingInputRequest] = useState<InputRequest | undefined>();
  const [answeredInputRequestIds, setAnsweredInputRequestIds] = useState<Set<string>>(() => new Set());
  const [tokenUsage, setTokenUsage] = useState<TokenUsage>({
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0
  });
  const [isFlashing, setIsFlashing] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [isFocused, setIsFocused] = useState(false);
  const [shortcutHint, setShortcutHint] = useState("Ctrl + /");
  const [caretState, setCaretState] = useState({ left: 8, top: 8, height: 24, visible: false });
  const [expandedUserMessages, setExpandedUserMessages] = useState<Record<string, boolean>>({});
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [overflowingUserMessages, setOverflowingUserMessages] = useState<Record<string, boolean>>({});
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
  const activeRequestControllerRef = useRef<AbortController | undefined>();
  const activeAssistantIdRef = useRef<string | undefined>();
  const manualStopRequestedRef = useRef(false);
  const countedUsageEventsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let nextEventIndex = 0;

    const intervalId = window.setInterval(() => {
      const nextEvent = MOCK_STREAMING_ASSISTANT_EVENTS[nextEventIndex];
      const isLastEvent = nextEventIndex === MOCK_STREAMING_ASSISTANT_EVENTS.length - 1;

      setMessages((current) =>
        current.map((message) =>
          message.id === MOCK_STREAMING_ASSISTANT_MESSAGE_ID
            ? {
                ...message,
                content: nextEvent.eventType === "assistant.message"
                  ? `${message.content}${typeof nextEvent.data.content === "string" ? nextEvent.data.content : ""}`
                  : message.content,
                events: [...(message.events ?? []), nextEvent],
                status: isLastEvent ? "done" : "streaming"
              }
            : message
        )
      );

      nextEventIndex += 1;
      if (nextEventIndex >= MOCK_STREAMING_ASSISTANT_EVENTS.length) {
        window.clearInterval(intervalId);
      }
    }, MOCK_STREAMING_LINE_DELAY_MS);

    return () => window.clearInterval(intervalId);
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
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
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

  async function handleStopRequest() {
    if (!isSending) {
      return;
    }

    manualStopRequestedRef.current = true;
    activeRequestControllerRef.current?.abort();
    setIsSending(false);
    setError(undefined);

    const assistantId = activeAssistantIdRef.current;
    if (assistantId) {
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content: message.content || "已停止。",
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

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
      try {
        await answerUserInput(sessionId, pendingInputRequest.requestId, prompt, true);
        setPendingInputRequest(undefined);
        setAnsweredInputRequestIds((current) => new Set(current).add(pendingInputRequest.requestId));
      } catch (caught) {
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
    manualStopRequestedRef.current = false;
    activeRequestControllerRef.current = requestController;
    activeAssistantIdRef.current = assistantId;
    setError(undefined);
    setDraft("");
    setIsSending(true);
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
          appendInputRequest(assistantId, request);
          appendDisplayEvent(assistantId, {
            type: "input_request",
            eventType: "input_request",
            data: request
          });
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
                  content: item.content || "已停止。",
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

  function appendInputRequest(assistantId: string, request: InputRequest) {
    setMessages((current) =>
      current.map((message) =>
        message.id === assistantId
          ? { ...message, inputRequests: [...(message.inputRequests ?? []), request] }
          : message
      )
    );
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

    const inputTokens = numberValue(data.inputTokens);
    const outputTokens = numberValue(data.outputTokens);
    const cacheReadTokens = numberValue(data.cacheReadTokens);
    const cacheWriteTokens = numberValue(data.cacheWriteTokens);

    if (!inputTokens && !outputTokens && !cacheReadTokens && !cacheWriteTokens) {
      return;
    }

    setTokenUsage((current) => ({
      inputTokens: current.inputTokens + inputTokens,
      outputTokens: current.outputTokens + outputTokens,
      cacheReadTokens: current.cacheReadTokens + cacheReadTokens,
      cacheWriteTokens: current.cacheWriteTokens + cacheWriteTokens
    }));
  }

  async function handleChoiceSelect(requestId: string, choice: string) {
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
      await answerUserInput(sessionId, requestId, choice, false);
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

  return (
    <div className="app-container">
      <DotPulseBackdrop isActive={isSending || Boolean(pendingInputRequest)} isDarkMode={isDarkMode} />
      <main className="shell">
        <header className="shell-header" aria-label="Chat controls">
          <div className="header-agent-info">
            <div className="header-agent-name">{agentInfo?.app.name ?? "Agent"}</div>
            <div className="header-agent-meta">
              <span>{subtitle}</span>
              {(agentInfo?.agent.skillDirectories?.length ?? 0) > 0 ? (
                <span>{agentInfo?.agent.skillDirectories?.length} Skills</span>
              ) : null}
              {agentInfo?.agent.instructions ? <span>Instructions</span> : null}
            </div>
          </div>
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
            <article
              className={`message ${message.role} ${message.isNew ? "message-enter" : ""}`}
              key={message.id}
              onAnimationEnd={() => {
                if (!message.isNew) {
                  return;
                }

                setMessages((current) =>
                  current.map((item) => (item.id === message.id ? { ...item, isNew: false } : item))
                );
              }}
            >
              <div className="message-inner">
                <div className="message-header">
                  <div className="message-meta"></div>
                </div>
                {message.role === "user" ? (
                  <div
                    className={`user-message-card ${expandedUserMessages[message.id] ? "expanded" : "collapsed"} ${overflowingUserMessages[message.id] ? "overflowing" : ""}`}
                  >
                    <div className="user-message-clip">
                      <div
                        className="message-content user-message-body"
                        ref={(element) => {
                          userMessageBodyRefs.current[message.id] = element;
                        }}
                      >
                        {message.content ? <MessageContent content={message.content} isDarkMode={isDarkMode} /> : null}
                      </div>
                    </div>
                    {overflowingUserMessages[message.id] ? (
                      <button
                        className="user-message-toggle"
                        type="button"
                        onClick={() => toggleUserMessageExpansion(message.id)}
                      >
                        {expandedUserMessages[message.id] ? "收起" : "展开全部"}
                      </button>
                    ) : null}
                  </div>
                ) : (
                  message.content || message.events?.length ? (
                    <MarkdownMessageContent
                      content={message.content}
                      events={message.events}
                      onChoiceSelect={handleChoiceSelect}
                      answeredInputRequestIds={answeredInputRequestIds}
                    />
                  ) : null
                )}
                {message.content && (
                  <button 
                    className="copy-button" 
                    onClick={() => handleCopy(message.content, message.id)}
                    aria-label={copiedMessageId === message.id ? "Copied!" : "Copy message"}
                    title={copiedMessageId === message.id ? "已复制" : "复制"}
                  >
                    {copiedMessageId === message.id ? <CheckIcon /> : <CopyIcon />}
                  </button>
                )}
              </div>
            </article>
          ))}
          <div className="chat-spacer" ref={bottomRef} />
        </div>
      </section>

      <div className="composer-container">
        <LiquidGlassInput
          className={`composer ${isFlashing ? "flash" : ""} ${isFocused ? "focused" : ""}`}
          hasText={draft.length > 0}
          isActive={!isSending || Boolean(pendingInputRequest)}
          isDarkMode={isDarkMode}
          isEditable={isFocused}
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
            <button
              type="submit"
              aria-label="Send message"
              className="send-button"
              title="发送"
            >
              <SendIcon />
            </button>
            {isSending && !pendingInputRequest ? (
              <button
                type="button"
                aria-label="Stop response"
                className="send-button stop-button"
                onClick={handleStopRequest}
                title="停止"
              >
                <StopIcon />
              </button>
            ) : null}
          </div>
        </LiquidGlassInput>
      </div>
      </main>
    </div>
  );
}

function ThinkingTitle() {
  return (
    <div className="thinking-title" aria-live="polite">
      <span>正在思考</span>
      <span className="thinking-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
    </div>
  );
}

function formatTokenUsage(usage: TokenUsage) {
  const total = usage.inputTokens + usage.outputTokens;
  const cacheTotal = usage.cacheReadTokens + usage.cacheWriteTokens;
  const base = `Tokens ${formatCompactNumber(total)} · In ${formatCompactNumber(usage.inputTokens)} · Out ${formatCompactNumber(usage.outputTokens)}`;

  return cacheTotal > 0 ? `${base} · Cache ${formatCompactNumber(cacheTotal)}` : base;
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("en", {
    maximumFractionDigits: value >= 1000 ? 1 : 0,
    notation: value >= 1000 ? "compact" : "standard"
  }).format(value);
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function usageEventKey(data: Record<string, unknown>) {
  return [data.apiCallId, data.providerCallId]
    .map((value) => (typeof value === "string" && value.trim() ? value : undefined))
    .filter(Boolean)
    .join(":") || undefined;
}

function AssistantInputRequests({ requests }: { requests: InputRequest[] }) {
  if (!requests.length) {
    return null;
  }

  return (
    <div className="input-request-list">
      {requests.map((request) => (
        <section className="input-request-card" key={request.requestId}>
          <div className="input-request-label">问题</div>
          <p>{request.question}</p>
          {request.choices?.length ? (
            <>
              <div className="input-request-label">选项</div>
              <div className="input-request-choices">
                {request.choices.map((choice) => (
                  <span className="input-request-choice" key={choice}>
                    {choice}
                  </span>
                ))}
              </div>
            </>
          ) : null}
        </section>
      ))}
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

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="5" width="14" height="14" rx="2" />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
  );
}
