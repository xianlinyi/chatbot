import React, { useEffect, useRef, useState } from "react";
import { StatusLabel } from "./StatusLabel";

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
  const isActive = !isComplete;
  const [isRetiring, setIsRetiring] = useState(false);
  const wasCompleteRef = useRef(isComplete);
  const shouldStartRetiring = isComplete && !wasCompleteRef.current;
  const shouldShowRetiring = isRetiring || shouldStartRetiring;

  useEffect(() => {
    let timeoutId: number | undefined;

    if (!isComplete) {
      setIsRetiring(false);
    } else if (!wasCompleteRef.current) {
      setIsRetiring(true);
      timeoutId = window.setTimeout(() => setIsRetiring(false), 950);
    }

    wasCompleteRef.current = isComplete;

    return () => {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [isComplete]);
  
  return (
    <div className={`tool-execution-block ${isError ? 'error' : ''} ${isActive ? 'active' : ''} ${shouldShowRetiring ? 'retiring' : ''}`}>
      <span className="tool-execution-marker" aria-hidden="true">
        <span className="tool-execution-dot" />
        <svg className="tool-execution-ring" viewBox="0 0 12 12">
          <circle cx="6" cy="6" r="5" pathLength="100" />
        </svg>
      </span>
      <StatusLabel 
        text={isComplete ? (success === false ? `调用失败 · ${toolName || "未知"}` : `调用完成 · ${toolName || "未知"}`) : `正在调用工具 · ${toolName || "未知"}`} 
        active={!isComplete} 
      />
      {description && (
        <div className="tool-execution-description">
          {description}
        </div>
      )}
      {command && (
        <pre className="tool-execution-command">
          <code>{command}</code>
        </pre>
      )}
      {progress?.length ? (
        <div className="tool-execution-progress">
          {progress.map((item, index) => (
            <div key={`${item}-${index}`}>{item}</div>
          ))}
        </div>
      ) : null}
      {output ? (
        <details className="tool-execution-details" open={!isComplete}>
          <summary>工具输出</summary>
          <pre>
            <code>{output}</code>
          </pre>
        </details>
      ) : null}
      {result ? (
        <details className="tool-execution-details">
          <summary>执行结果</summary>
          <pre>
            <code>{result}</code>
          </pre>
        </details>
      ) : null}
      {error ? (
        <div className="tool-execution-error">{error}</div>
      ) : null}
    </div>
  );
}
