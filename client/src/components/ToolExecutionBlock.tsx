import React from "react";
import { StatusLabel } from "./StatusLabel";
import "./ToolExecutionBlock.css";

type CodeLanguage = "bash" | "json" | "diff" | "output";

export function ToolExecutionBlock({
  toolName,
  description,
  command,
  progress,
  output,
  result,
  error,
  success,
  isComplete
}: {
  toolName: string;
  description: string;
  command: string;
  progress?: string[];
  output?: string;
  result?: string;
  error?: string;
  success?: boolean;
  isComplete: boolean;
}) {
  const isError = isComplete && success === false;
  const commandLanguage = detectCommandLanguage(toolName, command);
  const outputLanguage = detectOutputLanguage(output);
  const resultLanguage = detectOutputLanguage(result);
  const detailValue = result || output;
  const detailLabel = result ? "执行结果" : "工具输出";
  const detailLanguage = result ? resultLanguage : outputLanguage;
  const statusText = isComplete
    ? (success === false ? `调用失败 · ${toolName || "未知"}` : `调用完成 · ${toolName || "未知"}`)
    : `正在调用工具 · ${toolName || "未知"}`;
  
  return (
    <details className={`tool-execution-block ${!isComplete ? "active" : ""} ${isError ? "error" : ""}`} open>
      <summary className="tool-execution-summary">
        <StatusLabel text={statusText} active={!isComplete} />
      </summary>
      <div className="tool-execution-body">
        {description && (
          <div className="tool-execution-description">
            {description}
          </div>
        )}
        {command && (
          <HighlightedCodeBlock className="tool-execution-command" language={commandLanguage} value={command} />
        )}
        {progress?.length ? (
          <div className="tool-execution-progress">
            {progress.map((item, index) => (
              <div key={`${item}-${index}`}>{item}</div>
            ))}
          </div>
        ) : null}
        {detailValue ? (
          <details className="tool-execution-details" open={Boolean(result) || !isComplete}>
            <summary>{detailLabel}</summary>
            <HighlightedCodeBlock language={detailLanguage} value={detailValue} />
          </details>
        ) : null}
        {error ? (
          <div className="tool-execution-error">{error}</div>
        ) : null}
      </div>
    </details>
  );
}

function HighlightedCodeBlock({
  className,
  language,
  value
}: {
  className?: string;
  language: CodeLanguage;
  value: string;
}) {
  return (
    <pre className={["tool-code-block", `language-${language}`, className].filter(Boolean).join(" ")}>
      <code>{highlightCode(value, language)}</code>
    </pre>
  );
}

function detectCommandLanguage(toolName: string, value: string): CodeLanguage {
  if (isJsonLike(value)) {
    return "json";
  }

  const normalizedToolName = toolName.toLowerCase();
  if (["bash", "shell", "sh", "zsh", "terminal"].some((name) => normalizedToolName.includes(name))) {
    return "bash";
  }

  return "output";
}

function detectOutputLanguage(value?: string): CodeLanguage {
  if (!value) {
    return "output";
  }

  if (isJsonLike(value)) {
    return "json";
  }

  if (/^(diff --git|@@ |\+\+\+ |--- |\+|-)/m.test(value)) {
    return "diff";
  }

  return "output";
}

function isJsonLike(value: string) {
  const trimmed = value.trim();
  if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) {
    return false;
  }

  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

function highlightCode(value: string, language: CodeLanguage) {
  if (language === "json") {
    return highlightJson(value);
  }

  if (language === "bash") {
    return highlightBash(value);
  }

  if (language === "diff") {
    return highlightDiff(value);
  }

  return highlightOutput(value);
}

function highlightJson(value: string) {
  return tokenize(value, /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|-?\b\d+(?:\.\d+)?\b/g, (match) => {
    if (match[1]) {
      return match[2] ? "token-key" : "token-string";
    }

    if (/^(true|false|null)$/.test(match[0])) {
      return "token-literal";
    }

    return "token-number";
  });
}

function highlightBash(value: string) {
  return value.split(/(\s+|&&|\|\||[|;]|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|--?[A-Za-z0-9][\w-]*)/g).map((part, index) => {
    if (!part) {
      return null;
    }

    if (/^\s+$/.test(part)) {
      return part;
    }

    let className = "";
    if (/^--?/.test(part)) {
      className = "token-option";
    } else if (/^&&$|^\|\|$|^[|;]$/.test(part)) {
      className = "token-operator";
    } else if (/^["']/.test(part)) {
      className = "token-string";
    } else if (index === 0 || /^\b(git|npm|pnpm|yarn|node|tsx|curl|rg|sed|cat|cd|ls)\b$/.test(part)) {
      className = "token-command";
    }

    return className ? (
      <span className={className} key={`bash-${index}`}>
        {part}
      </span>
    ) : (
      part
    );
  });
}

function highlightDiff(value: string) {
  return value.split(/(\n)/).map((line, index) => {
    if (line === "\n") {
      return line;
    }

    const className = line.startsWith("+")
      ? "token-added"
      : line.startsWith("-")
        ? "token-removed"
        : line.startsWith("@@")
          ? "token-hunk"
          : "";

    return className ? (
      <span className={className} key={`diff-${index}`}>
        {line}
      </span>
    ) : (
      line
    );
  });
}

function highlightOutput(value: string) {
  return value.split(/(\n)/).map((line, index) => {
    if (line === "\n") {
      return line;
    }

    const className = /^[AMDRCU?!]{1,2}\s+/.test(line)
      ? "token-status"
      : /\b(error|failed|fatal)\b/i.test(line)
        ? "token-error"
        : /\b(warn|warning)\b/i.test(line)
          ? "token-warning"
          : "";

    return className ? (
      <span className={className} key={`output-${index}`}>
        {line}
      </span>
    ) : (
      line
    );
  });
}

function tokenize(
  value: string,
  pattern: RegExp,
  getClassName: (match: RegExpExecArray) => string
) {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(value.slice(lastIndex, match.index));
    }

    nodes.push(
      <span className={getClassName(match)} key={`token-${match.index}-${match[0]}`}>
        {match[0]}
      </span>
    );
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < value.length) {
    nodes.push(value.slice(lastIndex));
  }

  return nodes;
}
