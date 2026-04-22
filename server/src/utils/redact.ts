const secretKeyPattern = /(token|secret|password|authorization|api[-_]?key|credential|cookie)/i;

export function redactSecrets<T>(value: T): T {
  return redact(value) as T;
}

function redact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redact(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        shouldRedactString(key, child) ? "[REDACTED]" : redact(child)
      ])
    );
  }

  return value;
}

function shouldRedactString(key: string, value: unknown): boolean {
  return typeof value === "string" && key !== "tokenType" && secretKeyPattern.test(key) && !/env$/i.test(key);
}
