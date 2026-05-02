export class PiiMaskingService {
  private readonly literalSecrets: string[];

  constructor(extraSecrets: string[] = []) {
    this.literalSecrets = [...extraSecrets, ...collectSecretEnvValues()].filter(isMaskableLiteralSecret);
  }

  maskText(value: string): string {
    const masked = value
      .replace(/([a-z][a-z0-9+.-]*:\/\/[^:\s/@]+:)([^@\s]+)(@)/gi, "$1[SECRET_REDACTED]$3")
      .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[SECRET_REDACTED]")
      .replace(
        /\b(password|passwd|pwd|token|api[_-]?key|secret|cookie)(\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,
        "$1$2[SECRET_REDACTED]"
      )
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[EMAIL_REDACTED]")
      .replace(/\b1[3-9]\d{9}\b/g, "[PHONE_REDACTED]")
      .replace(/\b(?:\d[ -]*?){13,19}\b/g, "[CARD_REDACTED]");

    return this.literalSecrets.reduce(
      (current, secret) => current.split(secret).join("[SECRET_REDACTED]"),
      masked
    );
  }

  maskUnknown<T>(value: T): T {
    if (typeof value === "string") {
      return this.maskText(value) as T;
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.maskUnknown(item)) as T;
    }

    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [
          key,
          isSensitiveKey(key) ? "[SECRET_REDACTED]" : this.maskUnknown(entry)
        ])
      ) as T;
    }

    return value;
  }
}

function isSensitiveKey(key: string): boolean {
  return /pass(word)?|passwd|pwd|token|secret|api[-_]?key|authorization|cookie|credential|dsn|connection[-_]?string/i.test(
    key
  );
}

function collectSecretEnvValues(): string[] {
  return Object.entries(process.env)
    .filter(([key, value]) => Boolean(value) && isSensitiveKey(key))
    .map(([, value]) => value?.trim() ?? "")
    .filter(Boolean);
}

function isMaskableLiteralSecret(value: string): boolean {
  const normalized = value.trim();
  if (normalized.length < 8) {
    return false;
  }

  if (/^(password|authorization|bearer|token|secret|cookie|undefined|null|true|false)$/i.test(normalized)) {
    return false;
  }

  return normalized.length >= 16 || /[^A-Za-z]/.test(normalized);
}
