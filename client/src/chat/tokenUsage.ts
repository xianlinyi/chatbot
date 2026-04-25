export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

export const EMPTY_TOKEN_USAGE: TokenUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0
};

export function usageEventKey(data: Record<string, unknown>): string | undefined {
  return (
    [data.apiCallId, data.providerCallId]
      .map((value) => (typeof value === "string" && value.trim() ? value : undefined))
      .filter(Boolean)
      .join(":") || undefined
  );
}

export function tokenUsageFromEvent(data: Record<string, unknown>): TokenUsage | undefined {
  const usage = {
    inputTokens: numberValue(data.inputTokens),
    outputTokens: numberValue(data.outputTokens),
    cacheReadTokens: numberValue(data.cacheReadTokens),
    cacheWriteTokens: numberValue(data.cacheWriteTokens)
  };

  if (!usage.inputTokens && !usage.outputTokens && !usage.cacheReadTokens && !usage.cacheWriteTokens) {
    return undefined;
  }

  return usage;
}

export function addTokenUsage(left: TokenUsage, right: TokenUsage): TokenUsage {
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    cacheReadTokens: left.cacheReadTokens + right.cacheReadTokens,
    cacheWriteTokens: left.cacheWriteTokens + right.cacheWriteTokens
  };
}

export function formatTokenUsage(usage: TokenUsage): string {
  const total = usage.inputTokens + usage.outputTokens;
  const cacheTotal = usage.cacheReadTokens + usage.cacheWriteTokens;
  const base = `Tokens ${formatCompactNumber(total)} · In ${formatCompactNumber(usage.inputTokens)} · Out ${formatCompactNumber(usage.outputTokens)}`;

  return cacheTotal > 0 ? `${base} · Cache ${formatCompactNumber(cacheTotal)}` : base;
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat("en", {
    maximumFractionDigits: value >= 1000 ? 1 : 0,
    notation: value >= 1000 ? "compact" : "standard"
  }).format(value);
}
