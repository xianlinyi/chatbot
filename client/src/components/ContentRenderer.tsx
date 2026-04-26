import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatDisplayEvent } from "../types";
import { GlassCard } from "./GlassCard";
import { SendIcon } from "./icons";
import { StatusLabel } from "./StatusLabel";
import { ToolExecutionBlock } from "./ToolExecutionBlock";

type Block = {
  type: "markdown" | "tool" | "message" | "choice" | "session" | "skill";
  content?: string;
  toolCallId?: string;
  toolName?: string;
  skillName?: string;
  requestId?: string;
  command?: string;
  description?: string;
  progress?: string[];
  output?: string;
  result?: string;
  error?: string;
  question?: string;
  choices?: string[];
  allowFreeform?: boolean;
  askUserKey?: string;
  isSyntheticAskUser?: boolean;
  success?: boolean;
  isComplete?: boolean;
};

type Turn = {
  type: "turn";
  turnId?: string;
  blocks: Block[];
  isComplete: boolean;
  hasToolRequests?: boolean;
  hasAskUserRequest?: boolean;
  intent?: string;
};

type ParsedNode = Block | Turn;

export function ContentRenderer({
  content,
  events,
  onChoiceSelect,
  answeredInputRequestIds
}: {
  content: string;
  events?: ChatDisplayEvent[];
  onChoiceSelect?: (requestId: string, choice: string, wasFreeform?: boolean) => void;
  answeredInputRequestIds?: ReadonlySet<string>;
}) {
  const nodes = useMemo(() => {
    if (events?.length) {
      return mergeAdjacentInactiveTurns(parseDisplayEvents(events));
    }

    return content.trim() ? [{ type: "markdown", content } satisfies Block] : [];
  }, [content, events]);

  const renderBlock = (block: Block, idx: number | string) => {
    if (block.type === "tool") {
      return (
        <ToolExecutionBlock
          key={`tool-${idx}`}
          toolName={block.toolName || ""}
          description={block.description || ""}
          command={block.command || ""}
          progress={block.progress}
          output={block.output}
          result={block.result}
          error={block.error}
          success={block.success}
          isComplete={!!block.isComplete}
        />
      );
    }

    if (block.type === "choice") {
      if (block.requestId && answeredInputRequestIds?.has(block.requestId)) {
        return null;
      }

      return (
        <ChoiceRequestCard
          key={`choice-${idx}`}
          requestId={block.requestId}
          question={block.question || ""}
          choices={block.choices ?? []}
          allowFreeform={Boolean(block.allowFreeform)}
          disabled={block.requestId ? answeredInputRequestIds?.has(block.requestId) : false}
          onChoiceSelect={onChoiceSelect}
        />
      );
    }

    if (block.type === "skill") {
      return (
        <SkillPillCard
          key={`skill-${idx}`}
          name={block.skillName || block.toolName || "skill"}
          description={block.description}
        />
      );
    }

    if (block.type === "session" && block.content?.trim()) {
      return (
        <div className="message-content markdown-message-content" key={`session-${idx}`}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{block.content}</ReactMarkdown>
        </div>
      );
    }

    if ((block.type === "markdown" || block.type === "message") && block.content?.trim()) {
      return (
        <div className="message-content markdown-message-content" key={`${block.type}-${idx}`}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{block.content}</ReactMarkdown>
        </div>
      );
    }

    return null;
  };

  return (
    <>
      {nodes.map((node, idx) => {
        if (node.type === "turn") {
          return <TurnNode key={`turn-${idx}`} turn={node} idx={idx} renderBlock={renderBlock} />;
        }

        return renderBlock(node, idx);
      })}
    </>
  );
}

function parseDisplayEvents(events: ChatDisplayEvent[]): ParsedNode[] {
  const parentNodes: ParsedNode[] = [];
  const toolBlocks = new Map<string, Block>();
  const messageBlocks = new Map<string, Block>();
  let currentTurn: Turn | null = null;

  const pushBlock = (block: Block) => {
    if (currentTurn) {
      currentTurn.blocks.push(block);
    } else {
      parentNodes.push(block);
    }
  };

  const closeCurrentTurn = (turnId?: string) => {
    if (!currentTurn) {
      return;
    }

    if (!turnId || !currentTurn.turnId || String(currentTurn.turnId) === String(turnId)) {
      currentTurn.isComplete = true;
      parentNodes.push(currentTurn);
      currentTurn = null;
    }
  };

  for (const event of events) {
    const data = event.data ?? {};

    if (event.eventType === "assistant.turn_start") {
      if (currentTurn) {
        parentNodes.push(currentTurn);
      }
      currentTurn = {
        type: "turn",
        turnId: stringValue(data.turnId),
        blocks: [],
        isComplete: false
      };
      continue;
    }

    if (event.eventType === "assistant.turn_end") {
      closeCurrentTurn(stringValue(data.turnId));
      continue;
    }

    if (event.eventType === "assistant.intent") {
      if (currentTurn) {
        currentTurn.intent = stringValue(data.intent);
      }
      continue;
    }

    if (event.eventType === "assistant.message_delta") {
      const messageId = stringValue(data.messageId) ?? `delta-${messageBlocks.size}`;
      const block = getMessageBlock(messageBlocks, messageId, pushBlock);
      block.content = `${block.content ?? ""}${stringValue(data.deltaContent) ?? ""}`;
      continue;
    }

    if (event.eventType === "assistant.message") {
      const messageId = stringValue(data.messageId) ?? `message-${messageBlocks.size}`;
      const hasDeltaBlock = messageBlocks.has(messageId);
      const content = stringValue(data.content);
      const toolRequests = Array.isArray(data.toolRequests) ? data.toolRequests : [];

      if (currentTurn && toolRequests.length) {
        currentTurn.hasToolRequests = true;
        currentTurn.hasAskUserRequest = currentTurn.hasAskUserRequest || toolRequests.some(isAskUserRequest);
      }

      if (content && !hasDeltaBlock) {
        const block = getMessageBlock(messageBlocks, messageId, pushBlock);
        block.content = `${block.content ?? ""}${content}`;
      }

      for (const request of toolRequests) {
        const askUserBlock = createAskUserBlock(request);
        if (askUserBlock) {
          pushBlock(askUserBlock);
        }
      }
      continue;
    }

    if (event.type === "input_request" || event.eventType === "input_request") {
      const requestId = stringValue(data.requestId);
      const question = stringValue(data.question) ?? "";
      const choiceData = parseChoiceData(data.choices);
      const choices = choiceData.choices;
      const allowFreeform = booleanValue(data.allowFreeform ?? data.allow_freeform) || choiceData.allowFreeform;
      const askUserKey = makeAskUserKey(question, choices, allowFreeform);
      if (currentTurn) {
        currentTurn.hasAskUserRequest = true;
      }

      removeSyntheticAskUserBlock(parentNodes, currentTurn, askUserKey, question, choices);
      pushBlock(
        choices.length || allowFreeform
          ? {
              type: "choice",
              requestId,
              question,
              choices,
              allowFreeform,
              askUserKey
            }
          : {
              type: "message",
              requestId,
              content: question,
              askUserKey
            }
      );
      continue;
    }

    if (event.eventType === "tool.user_requested" || event.eventType === "tool.execution_start") {
      const toolCallId = stringValue(data.toolCallId) ?? `tool-${toolBlocks.size}`;
      const args = objectValue(data.arguments);
      const toolName = stringValue(data.toolName);
      const description = stringValue(args?.description);
      if (isAskUserToolName(toolName)) {
        if (currentTurn) {
          currentTurn.hasAskUserRequest = true;
        }
      }

      if (isSkillTool(toolName, args, data)) {
        const existingBlock = toolBlocks.get(toolCallId);
        if (existingBlock) {
          existingBlock.isComplete = false;
          existingBlock.description = description ?? existingBlock.description;
          existingBlock.skillName = skillDisplayName(args, data) ?? existingBlock.skillName;
          existingBlock.toolName = toolName ?? existingBlock.toolName;
          continue;
        }

        const block: Block = {
          type: "skill",
          toolCallId,
          toolName,
          skillName: skillDisplayName(args, data) ?? toolName,
          description,
          isComplete: false
        };
        toolBlocks.set(toolCallId, block);
        pushBlock(block);
        continue;
      }

      const existingBlock = toolBlocks.get(toolCallId);
      if (existingBlock) {
        existingBlock.isComplete = false;
        existingBlock.toolName = toolName ?? existingBlock.toolName;
        existingBlock.command = toolCallContent(args) ?? existingBlock.command;
        existingBlock.description = description ?? existingBlock.description;
        continue;
      }

      const block: Block = {
        type: "tool",
        toolCallId,
        toolName,
        command: toolCallContent(args),
        description,
        isComplete: false
      };
      toolBlocks.set(toolCallId, block);
      pushBlock(block);
      continue;
    }

    if (event.eventType === "tool.execution_progress") {
      const block = findToolBlock(toolBlocks, data);
      const progressMessage = stringValue(data.progressMessage);
      if (block && progressMessage) {
        block.progress = [...(block.progress ?? []), progressMessage];
      }
      continue;
    }

    if (event.eventType === "tool.execution_partial_result") {
      const block = findToolBlock(toolBlocks, data);
      const partialOutput = stringValue(data.partialOutput);
      if (block && partialOutput) {
        block.output = `${block.output ?? ""}${partialOutput}`;
      }
      continue;
    }

    if (event.eventType === "tool.execution_complete") {
      const block = findToolBlock(toolBlocks, data);
      if (block) {
        block.isComplete = true;
        block.success = data.success !== false;
        block.result = resultText(data.result);
        block.error = errorText(data.error);
      }
      continue;
    }

    const sessionSummary = formatSessionEvent(event.eventType, data);
    if (sessionSummary) {
      pushBlock({ type: "session", content: sessionSummary });
    }
  }

  if (currentTurn) {
    parentNodes.push(currentTurn);
  }

  return parentNodes;
}

function mergeAdjacentInactiveTurns(nodes: ParsedNode[]): ParsedNode[] {
  const mergedNodes: ParsedNode[] = [];

  for (const node of nodes) {
    const previous = mergedNodes[mergedNodes.length - 1];
    if (
      node.type === "turn" &&
      previous?.type === "turn" &&
      canMergeInactiveTurns(previous, node)
    ) {
      previous.blocks.push(...node.blocks);
      previous.hasToolRequests = previous.hasToolRequests || node.hasToolRequests;
      previous.hasAskUserRequest = previous.hasAskUserRequest || node.hasAskUserRequest;
      continue;
    }

    mergedNodes.push(node);
  }

  return mergedNodes;
}

function canMergeInactiveTurns(previous: Turn, next: Turn) {
  return previous.isComplete && next.isComplete && turnStatusText(previous) === turnStatusText(next);
}

function turnStatusText(turn: Turn) {
  const hasToolBlocks = turn.blocks.some((block) => block.type === "tool");
  if (turn.hasAskUserRequest) {
    return turn.isComplete ? "询问用户" : "正在询问用户";
  }

  if (hasToolBlocks) {
    return "请求工具";
  }

  return turn.intent || (turn.isComplete ? "思考完成" : "正在思考");
}

function getMessageBlock(
  messageBlocks: Map<string, Block>,
  messageId: string,
  pushBlock: (block: Block) => void
) {
  const existing = messageBlocks.get(messageId);
  if (existing) {
    return existing;
  }

  const block: Block = { type: "message", content: "" };
  messageBlocks.set(messageId, block);
  pushBlock(block);
  return block;
}

function findToolBlock(toolBlocks: Map<string, Block>, data: Record<string, unknown>) {
  const toolCallId = stringValue(data.toolCallId);
  if (toolCallId && toolBlocks.has(toolCallId)) {
    return toolBlocks.get(toolCallId);
  }

  return [...toolBlocks.values()].reverse().find((block) => !block.isComplete);
}

function isSkillTool(
  toolName: string | undefined,
  args: Record<string, unknown> | undefined,
  data: Record<string, unknown>
) {
  const normalizedToolName = toolName?.toLowerCase();
  if (normalizedToolName === "skill" || normalizedToolName === "skills") {
    return true;
  }

  return Boolean(
    stringValue(args?.skill) ||
      stringValue(args?.skillName) ||
      stringValue(args?.skill_name) ||
      stringValue(data.skill) ||
      stringValue(data.skillName) ||
      stringValue(data.skill_name)
  );
}

function skillDisplayName(args: Record<string, unknown> | undefined, data: Record<string, unknown>) {
  return (
    stringValue(args?.skill) ??
    stringValue(args?.skillName) ??
    stringValue(args?.skill_name) ??
    stringValue(args?.name) ??
    stringValue(data.skill) ??
    stringValue(data.skillName) ??
    stringValue(data.skill_name)
  );
}

function toolCallContent(args: Record<string, unknown> | undefined) {
  const command = stringValue(args?.command ?? args?.cmd);
  if (command) {
    return command;
  }

  const entries = Object.entries(args ?? {}).filter(([, value]) => value !== undefined);
  return entries.length ? JSON.stringify(Object.fromEntries(entries), null, 2) : undefined;
}

function isAskUserRequest(request: unknown) {
  return isAskUserToolName(stringValue(objectValue(request)?.name));
}

function isAskUserToolName(toolName: string | undefined) {
  return toolName?.toLowerCase() === "ask_user";
}

function createAskUserBlock(request: unknown): Block | undefined {
  const requestData = objectValue(request);
  if (!isAskUserToolName(stringValue(requestData?.name))) {
    return undefined;
  }

  const args = objectValue(requestData.arguments);
  const choiceData = parseChoiceData(args?.choices ?? args?.options);
  const choices = choiceData.choices;
  const allowFreeform = booleanValue(args?.allowFreeform ?? args?.allow_freeform ?? args?.freeform) || choiceData.allowFreeform;
  const type = stringValue(args?.type)?.toLowerCase();
  const question = stringValue(args?.question ?? args?.prompt ?? args?.message) ?? "";

  if (type === "choice" || choices.length > 0 || allowFreeform) {
    return {
      type: "choice",
      question,
      choices,
      allowFreeform,
      askUserKey: makeAskUserKey(question, choices, allowFreeform),
      isSyntheticAskUser: true
    };
  }

  const content = [
    question,
    stringValue(args?.description),
    ...Object.entries(args ?? {})
      .filter(([key]) => !["question", "prompt", "message", "description", "type"].includes(key))
      .flatMap(([, value]) => arrayStrings(value))
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .join("\n\n");

  return content
    ? {
        type: "message",
        content,
        askUserKey: makeAskUserKey(question, [], false),
        isSyntheticAskUser: true
      }
    : undefined;
}

function removeSyntheticAskUserBlock(
  parentNodes: ParsedNode[],
  currentTurn: Turn | null,
  askUserKey: string,
  question: string,
  choices: string[]
) {
  const removeFromBlocks = (blocks: Block[]) => {
    const index = blocks.findIndex((block) => matchesSyntheticAskUser(block, askUserKey, question, choices));
    if (index >= 0) {
      blocks.splice(index, 1);
    }
  };

  if (currentTurn) {
    removeFromBlocks(currentTurn.blocks);
    return;
  }

  const index = parentNodes.findIndex(
    (node) => node.type !== "turn" && matchesSyntheticAskUser(node, askUserKey, question, choices)
  );
  if (index >= 0) {
    parentNodes.splice(index, 1);
  }
}

function matchesSyntheticAskUser(block: Block, askUserKey: string, question: string, choices: string[]) {
  if (!block.isSyntheticAskUser) {
    return false;
  }

  if (block.askUserKey === askUserKey) {
    return true;
  }

  if ((block.question ?? "").trim() !== question.trim()) {
    return false;
  }

  const blockChoices = block.choices ?? [];
  return blockChoices.length === choices.length && blockChoices.every((choice, index) => choice === choices[index]);
}

function makeAskUserKey(question: string, choices: string[], allowFreeform = false) {
  return `${question.trim()}\u0000${choices.join("\u0000")}\u0000${allowFreeform ? "freeform" : ""}`;
}

function formatSessionEvent(eventType: string, data: Record<string, unknown>) {
  if (eventType === "session.error") {
    return stringValue(data.message) ?? "会话发生错误。";
  }

  if (eventType === "session.context_changed") {
    const repository = stringValue(data.repository);
    const branch = stringValue(data.branch);
    if (repository && branch) {
      return `上下文已切换到 ${repository} · ${branch}`;
    }
  }

  if (eventType === "session.compaction_start") {
    return "正在压缩上下文。";
  }

  if (eventType === "session.compaction_complete") {
    const success = data.success === true;
    return success ? "上下文压缩完成。" : `上下文压缩失败：${stringValue(data.error) ?? "未知错误"}`;
  }

  if (eventType === "session.task_complete") {
    return stringValue(data.summary);
  }

  return undefined;
}

function resultText(result: unknown) {
  const resultData = objectValue(result);
  const detailedContent = stringValue(resultData?.detailedContent);
  if (detailedContent) {
    return detailedContent;
  }

  const content = stringValue(resultData?.content);
  if (content) {
    return content;
  }

  const contents = resultData?.contents;
  if (Array.isArray(contents)) {
    return contents
      .map((item) => {
        const block = objectValue(item);
        return stringValue(block?.text ?? block?.content ?? block?.data);
      })
      .filter((item): item is string => Boolean(item))
      .join("\n");
  }

  return undefined;
}

function errorText(error: unknown) {
  const errorData = objectValue(error);
  return stringValue(errorData?.message) ?? stringValue(error);
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return undefined;
}

function booleanValue(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return value.toLowerCase() === "true";
  }

  return false;
}

function arrayStrings(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => arrayStrings(item));
  }

  const string = stringValue(value);
  return string ? [string] : [];
}

function parseChoiceData(value: unknown): { choices: string[]; allowFreeform: boolean } {
  if (!Array.isArray(value)) {
    return { choices: arrayStrings(value), allowFreeform: false };
  }

  const choices: string[] = [];
  let allowFreeform = false;

  for (const item of value) {
    const itemData = objectValue(item);
    if (itemData) {
      allowFreeform = allowFreeform || booleanValue(
        itemData.allowFreeform ?? itemData.allow_freeform ?? itemData.freeform
      );
      const label = stringValue(
        itemData.label ?? itemData.value ?? itemData.text ?? itemData.choice ?? itemData.name
      );
      if (label) {
        choices.push(label);
      }
      continue;
    }

    choices.push(...arrayStrings(item));
  }

  return { choices, allowFreeform };
}

function SkillPillCard({ name, description }: { name: string; description?: string }) {
  void description;

  return (
    <div className="skill-call-row">
      <span className="skill-call-pill">
        <span className="skill-call-light" aria-hidden="true" />
        <span className="skill-call-label">Skill</span>
        <span className="skill-call-name">{name}</span>
      </span>
    </div>
  );
}

function ChoiceRequestStrings({ parentRef }: { parentRef: React.RefObject<HTMLElement | null> }) {
  const NUM_STRINGS = 1;
  const gradientsRef = useRef<(SVGLinearGradientElement | null)[]>([]);
  // Use a unique ID for gradients to avoid clipping conflicts if multiple cards exist
  const uid = useMemo(() => Math.random().toString(36).slice(2, 8), []);

  useEffect(() => {
    if (!parentRef.current) return;
    
    // Each line has its own animation state
    const lines = Array.from({ length: NUM_STRINGS }).map(() => {
      return {
        speed: 0.3,
        currentPct: Math.random() * 100,
        targetPct: 50,
        width: 30,
        tension: 0.08
      };
    });

    let isHovered = false;
    let mousePct = 50;

    const handleMouseMove = (e: MouseEvent) => {
      if (!parentRef.current) return;
      const rect = parentRef.current.getBoundingClientRect();
      mousePct = ((e.clientX - rect.left) / rect.width) * 100;
    };

    const handleMouseEnter = () => { isHovered = true; };
    const handleMouseLeave = () => { isHovered = false; };

    const node = parentRef.current;
    node.addEventListener('mousemove', handleMouseMove);
    node.addEventListener('mouseenter', handleMouseEnter);
    node.addEventListener('mouseleave', handleMouseLeave);

    let frameId: number;
    const animate = () => {
      lines.forEach((line, i) => {
        if (isHovered) {
          // Converge to mouse position when hovered (sliding highlight to mouse location)
          line.currentPct += (mousePct - line.currentPct) * line.tension; 
        } else {
          // Auto sliding when not hovered
          line.currentPct += line.speed;
          if (line.currentPct > 120 || line.currentPct < -20) {
             line.speed *= -1;
             line.currentPct += line.speed * 2;
          }
        }
        
        const grad = gradientsRef.current[i];
        if (grad) {
          grad.setAttribute("x1", `${line.currentPct - line.width / 2}%`);
          grad.setAttribute("x2", `${line.currentPct + line.width / 2}%`);
        }
      });
      frameId = window.requestAnimationFrame(animate);
    };
    
    frameId = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(frameId);
      node.removeEventListener('mousemove', handleMouseMove);
      node.removeEventListener('mouseenter', handleMouseEnter);
      node.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [parentRef]);

  return (
    <svg className="choice-request-strings" viewBox="0 0 100 2" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        {Array.from({ length: NUM_STRINGS }).map((_, i) => {
          return (
            <linearGradient 
              key={`grad-${i}`} 
              id={`highlight-${uid}-${i}`} 
              y1="0%" 
              y2="0%" 
              ref={(el) => { gradientsRef.current[i] = el; }}
            >
              <stop offset="0%" stopColor="currentColor" stopOpacity="0" />
              <stop offset="50%" stopColor="currentColor" stopOpacity="0.9" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          );
        })}
      </defs>
      
      {Array.from({ length: NUM_STRINGS }).map((_, i) => {
        const y = 1;
        
        return (
          <g key={`line-${i}`}>
            {/* Background static line */}
            <line 
              x1="0" y1={y} x2="100" y2={y} 
              stroke="currentColor" 
              strokeWidth="0.5" 
              opacity="0.2" 
              vectorEffect="non-scaling-stroke" 
            />
            {/* Dynamic Highlight layer */}
            <line 
              x1="0" y1={y} x2="100" y2={y} 
              stroke={`url(#highlight-${uid}-${i})`} 
              strokeWidth="1.5" 
              vectorEffect="non-scaling-stroke" 
            />
          </g>
        );
      })}
    </svg>
  );
}

function ChoiceRequestCard({
  requestId,
  question,
  choices,
  allowFreeform,
  disabled = false,
  onChoiceSelect
}: {
  requestId?: string;
  question: string;
  choices: string[];
  allowFreeform: boolean;
  disabled?: boolean;
  onChoiceSelect?: (requestId: string, choice: string, wasFreeform?: boolean) => void;
}) {
  const cardRef = useRef<HTMLElement>(null);
  const [freeformValue, setFreeformValue] = useState("");
  const [isLocallyAnswered, setIsLocallyAnswered] = useState(false);
  const isWaiting = !disabled;
  const hasChoices = choices.length > 0;
  const prompt = hasChoices ? "请选择" : "请输入";
  const canSubmitFreeform = Boolean(requestId && freeformValue.trim() && !disabled);

  useEffect(() => {
    if (disabled) {
      setIsLocallyAnswered(true);
    }
  }, [disabled]);

  const submitFreeform = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const answer = freeformValue.trim();
    if (!requestId || !answer || disabled) {
      return;
    }

    setIsLocallyAnswered(true);
    onChoiceSelect?.(requestId, answer, true);
  };

  const selectChoice = (choice: string) => {
    if (!requestId || disabled) {
      return;
    }

    setIsLocallyAnswered(true);
    onChoiceSelect?.(requestId, choice, false);
  };

  if (isLocallyAnswered) {
    return null;
  }

  return (
    <section ref={cardRef} className={`choice-request-card ${isWaiting ? "waiting" : ""}`}>
      {isWaiting && <ChoiceRequestStrings parentRef={cardRef} />}
      <div className="choice-request-prompt">{prompt}</div>
      {question ? (
        <div className="choice-request-question">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{question}</ReactMarkdown>
        </div>
      ) : null}
      {hasChoices ? (
        <div className="choice-request-options" aria-label="选项">
          {choices.map((choice) => (
            <button
              className="choice-request-option"
              disabled={disabled || !requestId}
              key={choice}
              onClick={() => selectChoice(choice)}
              type="button"
            >
              {choice}
            </button>
          ))}
        </div>
      ) : null}
      {allowFreeform ? (
        <form className="choice-request-freeform" onSubmit={submitFreeform}>
          <input
            aria-label={hasChoices ? "自定义输入" : "请输入"}
            className="choice-request-freeform-input"
            disabled={disabled || !requestId}
            onChange={(event) => setFreeformValue(event.target.value)}
            placeholder={hasChoices ? "自定义输入..." : "输入内容..."}
            type="text"
            value={freeformValue}
          />
          <button
            aria-label="提交自定义输入"
            className="choice-request-freeform-submit"
            disabled={!canSubmitFreeform}
            title="提交"
            type="submit"
          >
            <SendIcon />
          </button>
        </form>
      ) : null}
    </section>
  );
}

function TurnNode({
  turn,
  idx,
  renderBlock
}: {
  turn: Turn;
  idx: number;
  renderBlock: (block: Block, idx: number | string) => React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(() => !turn.isComplete && !turn.hasAskUserRequest);

  const bodyBlocks = turn.blocks.filter(
    (block) => block.type === "message" || block.type === "skill" || block.type === "choice"
  );
  const otherBlocks = turn.blocks.filter(
    (block) => block.type !== "message" && block.type !== "skill" && block.type !== "choice"
  );
  const isSpecial = Boolean(otherBlocks.some((block) => block.type === "tool"));
  const hasCard = otherBlocks.length > 0;
  const canToggleCard = isSpecial && otherBlocks.length > 0;

  useEffect(() => {
    if (isSpecial) {
      setExpanded(!turn.isComplete && !turn.hasAskUserRequest);
    }
  }, [isSpecial, turn.hasAskUserRequest, turn.isComplete]);

  if (!hasCard) {
    if (turn.hasAskUserRequest) {
      return (
        <div className="assistant-turn" key={`turn-${idx}`}>
          <div className="assistant-turn-label collapsed">
            <span className="assistant-turn-toggle assistant-turn-toggle-static" aria-hidden="true" />
            <StatusLabel text={turnStatusText(turn)} active={!turn.isComplete} />
          </div>
          {bodyBlocks.map((block, blockIdx) => renderBlock(block, `${idx}-${blockIdx}`))}
        </div>
      );
    }

    return (
      <div className="assistant-turn" key={`turn-${idx}`}>
        {bodyBlocks.map((block, blockIdx) => renderBlock(block, `${idx}-${blockIdx}`))}
      </div>
    );
  }

  const statusText = turnStatusText(turn);
  const isCardExpanded = expanded;

  return (
    <div className="assistant-turn" key={`turn-${idx}`}>
      <div className="assistant-turn-label">
        {canToggleCard ? (
          <button
            type="button"
            className="assistant-turn-toggle"
            aria-label={expanded ? "收起工具详情" : "展开工具详情"}
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
            title={expanded ? "收起" : "展开"}
          />
        ) : null}
        <StatusLabel text={statusText} active={!turn.isComplete} />
      </div>
      {hasCard ? (
        <div
          className={`assistant-turn-card-shell ${isCardExpanded ? "expanded" : "collapsed"}`}
          aria-hidden={!isCardExpanded}
        >
          <GlassCard className="assistant-turn-card" maxHeight="200px">
            {otherBlocks.map((block, blockIdx) => renderBlock(block, `${idx}-${blockIdx}`))}
          </GlassCard>
        </div>
      ) : null}
      {bodyBlocks.map((block, blockIdx) => renderBlock(block, `${idx}-${blockIdx}`))}
    </div>
  );
}
