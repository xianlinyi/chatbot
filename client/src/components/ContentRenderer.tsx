import React, { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatDisplayEvent } from "../types";
import { GlassCard } from "./GlassCard";
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
  onChoiceSelect?: (requestId: string, choice: string) => void;
  answeredInputRequestIds?: ReadonlySet<string>;
}) {
  const nodes = useMemo(() => {
    if (events?.length) {
      return parseDisplayEvents(events);
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
      return (
        <ChoiceRequestCard
          key={`choice-${idx}`}
          requestId={block.requestId}
          question={block.question || ""}
          choices={block.choices ?? []}
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
      const choices = arrayStrings(data.choices);
      const askUserKey = makeAskUserKey(question, choices);
      if (currentTurn) {
        currentTurn.hasAskUserRequest = true;
      }

      removeSyntheticAskUserBlock(parentNodes, currentTurn, askUserKey);
      pushBlock(
        choices.length
          ? {
              type: "choice",
              requestId,
              question,
              choices,
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
      if (currentTurn && isAskUserToolName(toolName)) {
        currentTurn.hasAskUserRequest = true;
      }

      if (isSkillTool(toolName, args, data)) {
        const block: Block = {
          type: "skill",
          toolCallId,
          toolName,
          skillName: skillDisplayName(args, data) ?? toolName,
          description,
          isComplete: event.eventType === "tool.user_requested"
        };
        toolBlocks.set(toolCallId, block);
        pushBlock(block);
        continue;
      }

      const block: Block = {
        type: "tool",
        toolCallId,
        toolName,
        command: stringValue(args?.command ?? args?.cmd),
        description,
        isComplete: event.eventType === "tool.user_requested"
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
  const choices = arrayStrings(args?.choices ?? args?.options);
  const type = stringValue(args?.type)?.toLowerCase();
  const question = stringValue(args?.question ?? args?.prompt ?? args?.message) ?? "";

  if (type === "choice" || choices.length > 0) {
    return {
      type: "choice",
      question,
      choices,
      askUserKey: makeAskUserKey(question, choices),
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
        askUserKey: makeAskUserKey(question, []),
        isSyntheticAskUser: true
      }
    : undefined;
}

function removeSyntheticAskUserBlock(parentNodes: ParsedNode[], currentTurn: Turn | null, askUserKey: string) {
  const removeFromBlocks = (blocks: Block[]) => {
    const index = blocks.findIndex((block) => block.isSyntheticAskUser && block.askUserKey === askUserKey);
    if (index >= 0) {
      blocks.splice(index, 1);
    }
  };

  if (currentTurn) {
    removeFromBlocks(currentTurn.blocks);
    return;
  }

  const index = parentNodes.findIndex(
    (node) => node.type !== "turn" && node.isSyntheticAskUser && node.askUserKey === askUserKey
  );
  if (index >= 0) {
    parentNodes.splice(index, 1);
  }
}

function makeAskUserKey(question: string, choices: string[]) {
  return `${question.trim()}\u0000${choices.join("\u0000")}`;
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

function arrayStrings(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => arrayStrings(item));
  }

  const string = stringValue(value);
  return string ? [string] : [];
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

function ChoiceRequestCard({
  requestId,
  question,
  choices,
  disabled = false,
  onChoiceSelect
}: {
  requestId?: string;
  question: string;
  choices: string[];
  disabled?: boolean;
  onChoiceSelect?: (requestId: string, choice: string) => void;
}) {
  return (
    <section className="choice-request-card">
      <div className="choice-request-prompt">请选择</div>
      {question ? <p className="choice-request-question">{question}</p> : null}
      {choices.length ? (
        <div className="choice-request-options" aria-label="选项">
          {choices.map((choice) => (
            <button
              className="choice-request-option"
              disabled={disabled || !requestId}
              key={choice}
              onClick={requestId ? () => onChoiceSelect?.(requestId, choice) : undefined}
              type="button"
            >
              {choice}
            </button>
          ))}
        </div>
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
  const [expanded, setExpanded] = useState(false);

  const bodyBlocks = turn.blocks.filter(
    (block) => block.type === "message" || block.type === "skill" || block.type === "choice"
  );
  const otherBlocks = turn.blocks.filter(
    (block) => block.type !== "message" && block.type !== "skill" && block.type !== "choice"
  );
  const isSpecial = Boolean(otherBlocks.some((block) => block.type === "tool"));
  const canToggleCard = turn.isComplete && isSpecial && otherBlocks.length > 0;

  if (turn.isComplete && !isSpecial && !turn.hasAskUserRequest) {
    return (
      <div className="assistant-turn" key={`turn-${idx}`}>
        {bodyBlocks.map((block, blockIdx) => renderBlock(block, `${idx}-${blockIdx}`))}
      </div>
    );
  }

  const statusText = turn.hasAskUserRequest
    ? turn.isComplete
      ? "询问用户"
      : "正在询问用户"
    : isSpecial
      ? "请求工具"
      : turn.intent || (turn.isComplete ? "思考完成" : "正在思考");
  const hasCard = otherBlocks.length > 0;
  const isCardExpanded = !turn.isComplete || expanded;

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
