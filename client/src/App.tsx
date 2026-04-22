import { FormEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import * as THREE from "three";
import { answerUserInput, fetchAgentInfo, sendMessage } from "./api.js";
import type { ActivityItem, AgentInfoResponse, ChatMessage, InputRequest, StreamEvent, UsageStats } from "./types.js";

const USER_MESSAGE_COLLAPSED_HEIGHT = 168;

function areBooleanRecordsEqual(left: Record<string, boolean>, right: Record<string, boolean>) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);

  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every((key) => left[key] === right[key]);
}

function LiquidGlassSurface({
  hasText,
  isActive,
  isDarkMode,
  onDisplacementUpdate,
  onSizeUpdate
}: {
  hasText: boolean;
  isActive: boolean;
  isDarkMode: boolean;
  onDisplacementUpdate: (url: string) => void;
  onSizeUpdate: ({ width, height }: { width: number; height: number }) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const uniformsRef = useRef<{
    uActive: { value: number };
    uDark: { value: number };
    uHasText: { value: number };
    uPointer: { value: THREE.Vector2 };
  }>();

  useEffect(() => {
    const canvas = canvasRef.current;
    const surface = canvas?.parentElement;

    if (
      !canvas ||
      !surface ||
      typeof WebGLRenderingContext === "undefined" ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    const uniforms = {
      uActive: { value: isActive ? 1 : 0 },
      uDark: { value: isDarkMode ? 1 : 0 },
      uHasText: { value: hasText ? 1 : 0 },
      uPointer: { value: new THREE.Vector2(0.72, 0.36) },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 }
    };

    let renderer: THREE.WebGLRenderer;

    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        canvas,
        preserveDrawingBuffer: true,
        powerPreference: "high-performance"
      });
    } catch {
      return;
    }

    uniformsRef.current = uniforms;
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const material = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      transparent: true,
      uniforms,
      vertexShader: `
        varying vec2 vUv;

        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;

        varying vec2 vUv;

        uniform float uActive;
        uniform float uDark;
        uniform float uHasText;
        uniform float uTime;
        uniform vec2 uPointer;
        uniform vec2 uResolution;

        void main() {
          vec2 uv = vUv;
          vec2 aspect = vec2(uResolution.x / max(uResolution.y, 1.0), 1.0);
          vec2 p = (uv - 0.5) * aspect;
          vec2 pointer = (uPointer - 0.5) * aspect;
          
          float distToPointer = length(p - pointer);
          
          // 重新计算绝对像素边缘以限制特效范围在边缘极其细微的带内
          vec2 pixelCoord = uv * uResolution;
          
          // 计算到 24px 圆角矩形距离场 (SDF) 
          vec2 center = uResolution * 0.5;
          vec2 d = abs(pixelCoord - center);
          vec2 extents = center - vec2(24.0); // 外层容器圆角 24px
          vec2 q = d - extents;
          
          // 拐角程度系数 (0.0 表示直线边缘，1.0 表示处于最极端的拐角弧线点)
          float cornerFactor = clamp(max(q.x, 0.0) * max(q.y, 0.0) / 288.0, 0.0, 1.0);
          
          // 到圆角边框的垂直切线距离
          float distToBoundary = 24.0 - (length(max(q, 0.0)) + min(max(q.x, q.y), 0.0));
          
          vec2 signP = sign(pixelCoord - center);
          vec2 normal = vec2(0.0);
          if (q.x > 0.0 && q.y > 0.0) {
              normal = normalize(q) * signP;
          } else if (q.x > q.y) {
              normal = vec2(1.0, 0.0) * signP;
          } else {
              normal = vec2(0.0, 1.0) * signP;
          }
          
          // 现将所有边框统一设为 24px：
          float currentEdgeWidth = 24.0;
          
          // 形变发光区域遮罩与物理边厚强绑定同步消散，采用类似的抛物线消落
          float edgeMask = cos(clamp(distToBoundary / currentEdgeWidth, 0.0, 1.0) * 1.5707963);

          // 用户希望能有一致的透明颜色，移除原来的彩虹色散与焦点高亮
          vec3 baseColor = vec3(1.0);
          float alpha = 0.05 * edgeMask; // 极致微弱甚至能被忽略的一致透明抛光涂层
          if (uDark > 0.5) {
            alpha = 0.0; // 黑夜模式下彻底去除泛白涂层
          }
          
          gl_FragColor = vec4(baseColor, alpha);
        }
      `
    });

    const normalMaterial = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      transparent: true,
      uniforms,
      vertexShader: material.vertexShader,
      fragmentShader: `
        precision highp float;

        varying vec2 vUv;
        uniform vec2 uResolution;

        void main() {
          vec2 pixelCoord = vUv * uResolution;
          vec2 center = uResolution * 0.5;
          vec2 d = abs(pixelCoord - center);
          vec2 extents = center - vec2(24.0);
          vec2 q = d - extents;
          
          float distOutside = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
          float distToBoundary = 24.0 - distOutside;
          
          float edgeWidth = 12.0; 
          
          vec2 centeredP = pixelCoord - center; 
          vec2 signP = sign(centeredP);
          if(signP.x == 0.0) signP.x = 1.0;
          if(signP.y == 0.0) signP.y = 1.0;
          
          vec2 normal = vec2(0.0);
          if (q.x > 0.0 && q.y > 0.0) {
              normal = normalize(q) * signP;
          } else if (q.x > q.y) {
              normal = vec2(1.0, 0.0) * signP;
          } else {
              normal = vec2(0.0, 1.0) * signP;
          }
          
          vec2 disp = vec2(0.0);
          
          // 统一 24 像素的厚度
          float currentEdgeWidth = 24.0;

          // If within the edge boundary volume
          if (distToBoundary >= 0.0 && distToBoundary <= currentEdgeWidth) {
              float t = distToBoundary / currentEdgeWidth;
              // 为实现“纯粹单向拉伸”并彻底消除“折返/对称镜像线”的过度视觉：
              // 必须保证坐标采样函数单调不交叉！SVG max scale=64 (单侧最大偏移32px)。
              // 在24px物理厚度上，如果使用二次衰减且偏移总量>24，向内侧读取时必定反转交叉！
              // 所以我们要采取 24/32 = 0.75 强力安全限位，搭配完美的纯线性单调过渡。
              float amplitude = 0.35 * (1.0 - t);
              // X取反向(-normal.x)，Y取正向(+normal.y)，刚好能统一从所有边的中心内侧拉取画面像素
              disp = vec2(-normal.x, normal.y) * amplitude;
          }
          
          // Mapping disp to RGB channels (0 to 1) for the SVG DisplacementMap.
          // Invert both X and Y.
          vec2 colorData = clamp(vec2(disp.x, disp.y) * 0.5 + 0.5, 0.0, 1.0);
          gl_FragColor = vec4(colorData, 0.5, 1.0);
        }
      `
    });

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(mesh);

    const resize = () => {
      const { height, width } = surface.getBoundingClientRect();
      const nextWidth = Math.max(1, Math.floor(width));
      const nextHeight = Math.max(1, Math.floor(height));
      renderer.setSize(nextWidth, nextHeight, false);
      uniforms.uResolution.value.set(nextWidth, nextHeight);
      onSizeUpdate({ width: nextWidth, height: nextHeight });

      // Generate the replacement lens displacement map on resize
      mesh.material = normalMaterial;
      renderer.render(scene, camera);
      canvas.toBlob((blob) => {
        if (blob) {
          onDisplacementUpdate(URL.createObjectURL(blob));
        }
      }, "image/png");
      mesh.material = material;
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!surface) return;
      const bounds = surface.getBoundingClientRect();
      uniforms.uPointer.value.set(
        (event.clientX - bounds.left) / Math.max(bounds.width, 1),
        1 - (event.clientY - bounds.top) / Math.max(bounds.height, 1)
      );
    };

    let frameId = 0;
    const animate = () => {
      renderer.render(scene, camera);
      frameId = window.requestAnimationFrame(animate);
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(surface);
    window.addEventListener("pointermove", handlePointerMove);
    resize();
    frameId = window.requestAnimationFrame(() => {
      animate();
    });

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("pointermove", handlePointerMove);
      resizeObserver.disconnect();
      material.dispose();
      mesh.geometry.dispose();
      renderer.dispose();
      uniformsRef.current = undefined;
    };
  }, []);

  useEffect(() => {
    if (!uniformsRef.current) {
      return;
    }

    uniformsRef.current.uActive.value = isActive ? 1 : 0;
    uniformsRef.current.uDark.value = isDarkMode ? 1 : 0;
    uniformsRef.current.uHasText.value = hasText ? 1 : 0;
  }, [hasText, isActive, isDarkMode]);

  return <canvas aria-hidden="true" className="liquid-glass-canvas" ref={canvasRef} />;
}

export function App() {
  const [agentInfo, setAgentInfo] = useState<AgentInfoResponse | undefined>();
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "mock-1",
      role: "system",
      content: "Welcome to the GitHub Copilot Agent. How can I assist you today?"
    },
    {
      id: "mock-2",
      role: "user",
      content: "你可以用 React 写一个简单的计步器吗？"
    },
    {
      id: "mock-3",
      role: "assistant",
      content: `没问题，这里有一个用 React 编写的简单计步器 (Counter) 组件：

\`\`\`tsx
import React, { useState } from 'react';

function Counter() {
  const [count, setCount] = useState(0);

  return (
    <div style={{ padding: '20px', textAlign: 'center' }}>
      <h2>Current Count: {count}</h2>
      <button onClick={() => setCount(count - 1)}>-1</button>
      <button onClick={() => setCount(0)} style={{ margin: '0 10px' }}>Reset</button>
      <button onClick={() => setCount(count + 1)}>+1</button>
    </div>
  );
}

export default Counter;
\`\`\`

你可以把这段代码复制到你的 React 项目中使用。为了方便后续沟通，如果你还需要增加额外的特性（比如双向数据绑定或者持久化），随时告诉我！`
    },
    {
      id: "mock-4",
      role: "user",
      content: "谢谢！如果要加一个好看一点的 CSS 样式呢？"
    },
    {
      id: "mock-5",
      role: "assistant",
      content: `当然，这里为你提供一个增加了一些基础样式的版本。比如圆角、阴影和过渡动画：

\`\`\`css
/* styles.css */
.counter-container {
  max-width: 300px;
  margin: 40px auto;
  padding: 30px;
  border-radius: 16px;
  background: white;
  box-shadow: 0 10px 25px rgba(0,0,0,0.1);
  text-align: center;
  font-family: sans-serif;
  transition: transform 0.3s ease;
}

.counter-container:hover {
  transform: translateY(-5px);
}

.counter-button {
  background-color: #2563eb;
  color: white;
  border: none;
  padding: 10px 16px;
  margin: 0 6px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 16px;
  transition: background-color 0.2s;
}

.counter-button:hover {
  background-color: #1d4ed8;
}
\`\`\`

这样样式看起来会更现代化一些。试试看吧！`
    }
  ]);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [pendingInputRequest, setPendingInputRequest] = useState<InputRequest | undefined>();
  const [isFlashing, setIsFlashing] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [isFocused, setIsFocused] = useState(false);
  const [shortcutHint, setShortcutHint] = useState("Ctrl + /");
  const [caretState, setCaretState] = useState({ left: 8, top: 8, height: 24, visible: false });
  const [expandedUserMessages, setExpandedUserMessages] = useState<Record<string, boolean>>({});
  const [overflowingUserMessages, setOverflowingUserMessages] = useState<Record<string, boolean>>({});
  const [sessionUsage, setSessionUsage] = useState<UsageStats>({ inputTokens: 0, outputTokens: 0, duration: 0 });
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== "undefined") {
      return document.documentElement.classList.contains("dark") || window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    }
    return false;
  });
  const [displacementMapUrl, setDisplacementMapUrl] = useState("");
  const [composerSize, setComposerSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    return () => {
      if (displacementMapUrl && displacementMapUrl.startsWith("blob:")) {
        URL.revokeObjectURL(displacementMapUrl);
      }
    };
  }, [displacementMapUrl]);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const userMessageBodyRefs = useRef<Record<string, HTMLDivElement | null>>({});

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
        visible: isFocused && !isSending && selectionStart === selectionEnd
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
  }, [draft, isFocused, isSending]);

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
        await answerUserInput(sessionId, pendingInputRequest.requestId, prompt);
        setMessages((current) => [
          ...current,
          { id: crypto.randomUUID(), role: "user", content: prompt, isNew: true }
        ]);
        setPendingInputRequest(undefined);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Unable to answer Copilot.");
      }
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
      { id: crypto.randomUUID(), role: "user", content: prompt, isNew: true },
      { id: assistantId, role: "assistant", content: "", status: "streaming", isNew: true }
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

        if (event.type === "activity") {
          appendAssistantActivity(assistantId, event);
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
        }

        if (event.type === "input_response") {
          appendAssistantContent(assistantId, `\n\n**你已回答：** ${event.answer}\n\n`);
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
      // Ensure input is focused after message is sent
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  function appendAssistantContent(assistantId: string, content: string) {
    setMessages((current) =>
      current.map((message) =>
        message.id === assistantId ? { ...message, content: message.content + content } : message
      )
    );
  }

  function appendAssistantActivity(assistantId: string, event: Extract<StreamEvent, { type: "activity" }>) {
    const usage = parseUsageEvent(event);
    if (usage) {
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId ? { ...message, usage: addUsage(message.usage, usage) } : message
        )
      );
      setSessionUsage((current) => addUsage(current, usage));
      return;
    }

    if (!isToolActivity(event)) {
      return;
    }

    const activity: ActivityItem = {
      id: crypto.randomUUID(),
      title: event.title,
      detail: event.detail,
      level: event.level
    };

    setMessages((current) =>
      current.map((message) =>
        message.id === assistantId
          ? { ...message, activities: [...(message.activities ?? []), activity] }
          : message
      )
    );
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

  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content).catch(() => {});
  };

  const toggleUserMessageExpansion = (messageId: string) => {
    setExpandedUserMessages((current) => ({
      ...current,
      [messageId]: !current[messageId]
    }));
  };

  return (
    <div className="app-container">
      <svg aria-hidden="true" className="glass-filter-defs" focusable="false">
        <filter id="glass-edge-distortion" x="-50%" y="-50%" width="200%" height="200%" colorInterpolationFilters="sRGB">
          {displacementMapUrl && composerSize.width > 0 ? (
            <feImage 
              href={displacementMapUrl} 
              result="edgeNoise" 
              preserveAspectRatio="none" 
              x="0" 
              y="0" 
              width={composerSize.width} 
              height={composerSize.height} 
              crossOrigin="anonymous"
            />
          ) : (
            <feTurbulence baseFrequency="0.012 0.036" numOctaves="1" result="edgeNoise" seed="12" type="fractalNoise" />
          )}
          
          {/* 提取 R, G, B 三个通道分别进行位移，创造色散边缘透镜效果 */}
          <feColorMatrix type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" in="SourceGraphic" result="redSrc"/>
          <feColorMatrix type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" in="SourceGraphic" result="greenSrc"/>
          <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" in="SourceGraphic" result="blueSrc"/>

          {/* 三个通道赋予略微不同的 scale，模仿不同波长光线的折射率差 */}
           {/* 放大 scale 值：SVG位移的最大偏移量是 scale * 0.5。要想拉伸完整跨越 24px 边框，scale 至少需要是 48 */}
          <feDisplacementMap in="redSrc" in2="edgeNoise" scale="64" xChannelSelector="R" yChannelSelector="G" result="redDisp"/>
          <feDisplacementMap in="greenSrc" in2="edgeNoise" scale="60" xChannelSelector="R" yChannelSelector="G" result="greenDisp"/>
          <feDisplacementMap in="blueSrc" in2="edgeNoise" scale="56" xChannelSelector="R" yChannelSelector="G" result="blueDisp"/>

          {/* 将三通道利用 Screen Blend 重新合并成全彩画面 */}
          <feBlend mode="screen" in="redDisp" in2="greenDisp" result="rgDisp"/>
          <feBlend mode="screen" in="rgDisp" in2="blueDisp" result="rgbDisp"/>
        </filter>
      </svg>
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
                  <div className="message-meta">{message.role === 'assistant' && (agentInfo?.app.name ?? 'Agent')}</div>
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
                        {message.content ? (
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                        ) : null}
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
                  <div className="message-content">
                    {message.status === "streaming" ? <ThinkingTitle /> : null}
                    {message.content ? (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                    ) : (
                      null
                    )}
                    <AssistantToolActivity activities={message.activities ?? []} />
                    <AssistantInputRequests requests={message.inputRequests ?? []} />
                    {message.status !== "streaming" && message.usage ? (
                      <div className="message-usage">{formatUsage(message.usage)}</div>
                    ) : null}
                  </div>
                )}
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
        <form
          className={`composer ${isFlashing ? "flash" : ""} ${isFocused ? "focused" : ""}`}
          onSubmit={handleSubmit}
        >
          <LiquidGlassSurface hasText={draft.length > 0} isActive={isFocused || isSending} isDarkMode={isDarkMode} onDisplacementUpdate={setDisplacementMapUrl} onSizeUpdate={setComposerSize} />
          {error ? <div className="error-banner">{error}</div> : null}
          <div className="composer-inner">
            <div aria-hidden="true" className="composer-mirror" ref={mirrorRef} />
            <textarea
              ref={inputRef}
              aria-label="Message"
              value={draft}
              placeholder={pendingInputRequest ? "回答 Copilot 的问题" : shortcutHint}
              disabled={isSending && !pendingInputRequest}
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
              {sessionUsage.inputTokens || sessionUsage.outputTokens ? (
                <span className="composer-hint composer-usage" title="Session token usage">
                  {formatSessionUsage(sessionUsage)}
                </span>
              ) : null}
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

function AssistantToolActivity({ activities }: { activities: ActivityItem[] }) {
  if (!activities.length) {
    return null;
  }

  return (
    <section className="tool-activity" aria-label="正在运行工具">
      <div className="thinking-title tool-title">
        <span>正在运行工具</span>
        <span className="thinking-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </div>
      {activities.map((activity) => (
        <div className={`tool-event ${activity.level ?? "info"}`} key={activity.id}>
          <div className="tool-event-title">{activity.title}</div>
          {activity.detail ? <pre><code>{activity.detail}</code></pre> : null}
        </div>
      ))}
    </section>
  );
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

function isToolActivity(event: Extract<StreamEvent, { type: "activity" }>): boolean {
  return /^Tool |^Running tool:|^Tool completed:|^Tool failed:|^Tool requested:|^Tool progress$/i.test(event.title);
}

function parseUsageEvent(event: Extract<StreamEvent, { type: "activity" }>): UsageStats | undefined {
  if (!event.title.startsWith("Model usage:") || !event.detail) {
    return undefined;
  }

  try {
    const payload = JSON.parse(event.detail) as Partial<UsageStats>;
    return {
      inputTokens: numericValue(payload.inputTokens),
      outputTokens: numericValue(payload.outputTokens),
      duration: numericValue(payload.duration)
    };
  } catch {
    return undefined;
  }
}

function numericValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function addUsage(current: UsageStats | undefined, next: UsageStats): UsageStats {
  return {
    inputTokens: (current?.inputTokens ?? 0) + next.inputTokens,
    outputTokens: (current?.outputTokens ?? 0) + next.outputTokens,
    duration: (current?.duration ?? 0) + next.duration
  };
}

function formatUsage(usage: UsageStats): string {
  const totalTokens = usage.inputTokens + usage.outputTokens;
  return `本轮总计 ${totalTokens.toLocaleString()} tokens · 输入 ${usage.inputTokens.toLocaleString()} · 输出 ${usage.outputTokens.toLocaleString()} · ${formatDuration(usage.duration)}`;
}

function formatSessionUsage(usage: UsageStats): string {
  const totalTokens = usage.inputTokens + usage.outputTokens;
  return `Session 累计 ${totalTokens.toLocaleString()} tokens · 输入 ${usage.inputTokens.toLocaleString()} · 输出 ${usage.outputTokens.toLocaleString()}`;
}

function formatDuration(durationMs: number): string {
  if (!durationMs) {
    return "0s";
  }

  return `${(durationMs / 1000).toFixed(1)}s`;
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
