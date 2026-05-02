import type { AgentProvider, AgentStreamEvent } from "../providers/types.js";
import { PiiMaskingService } from "../policy/PiiMaskingService.js";

export class CopilotSdkAdapter {
  constructor(
    private readonly provider: AgentProvider,
    private readonly masking = new PiiMaskingService()
  ) {}

  async ask(prompt: string): Promise<string> {
    const session = await this.provider.createSession();
    const safePrompt = this.masking.maskText(prompt);

    try {
      if (this.provider.sendMessageText) {
        return await this.provider.sendMessageText(session.id, safePrompt);
      }

      const chunks: string[] = [];
      for await (const event of this.provider.sendMessageStream(session.id, safePrompt)) {
        if (event.type === "delta") {
          chunks.push(event.content);
        } else if (event.type === "error") {
          throw new Error(event.message);
        } else {
          collectTextFromProviderEvent(event, chunks);
        }
      }
      return chunks.join("").trim();
    } finally {
      await this.provider.closeSession(session.id);
    }
  }

  async askJson<T>(prompt: string): Promise<T> {
    const text = await this.ask(prompt);
    const json = extractJson(text);
    return JSON.parse(json) as T;
  }
}

function collectTextFromProviderEvent(event: AgentStreamEvent, chunks: string[]): void {
  if (event.type !== "copilot_event" && event.type !== "assistant_event") {
    return;
  }

  const content = event.data.content;
  if (typeof content === "string") {
    chunks.push(content);
  }
}

function extractJson(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  throw new Error("Copilot response did not contain JSON.");
}
