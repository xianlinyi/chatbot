import { nanoid } from "nanoid";
import type { AppConfig } from "../config/types.js";
import type { AgentInfo, AgentProvider, AgentSession, AgentStreamEvent } from "./types.js";
import {
  extractAssistantDelta,
  extractAssistantMessageContent,
  isCopilotToolEvent,
  parseCopilotActivity,
  type CopilotEvent
} from "./copilotResponseParser.js";

type CopilotSession = {
  on: {
    (eventType: string, handler: (event: CopilotEvent) => void): (() => void) | void;
    (handler: (event: CopilotEvent) => void): (() => void) | void;
  };
  sendAndWait: (input: { prompt: string; mode?: "enqueue" | "immediate" }) => Promise<unknown>;
  disconnect?: () => Promise<void>;
};

type CopilotClientLike = {
  start: () => Promise<void>;
  listModels: () => Promise<Array<{ id?: string }>>;
  createSession: (config: Record<string, unknown>) => Promise<CopilotSession>;
  stop: () => Promise<void>;
};

type UserInputRequest = {
  question: string;
  choices?: string[];
  allowFreeform?: boolean;
};

type MessageRunStats = {
  assistantText: string;
  toolEventCount: number;
};

type ActiveRun = {
  queue: AsyncQueue<AgentStreamEvent>;
  stats: MessageRunStats;
};

type PendingUserInput = {
  sessionId: string;
  resolve: (answer: { answer: string; wasFreeform: boolean }) => void;
};

type AsyncQueue<T> = AsyncIterable<T> & { push: (item: T) => void; end: () => void };

export class GithubCopilotAgentProvider implements AgentProvider {
  private readonly sessions = new Map<string, CopilotSession>();
  private readonly activeRuns = new Map<string, ActiveRun>();
  private readonly pendingUserInputs = new Map<string, PendingUserInput>();
  private clientPromise: Promise<CopilotClientLike> | undefined;
  private authPreflightPromise: Promise<void> | undefined;

  constructor(private readonly config: AppConfig) {}

  getInfo(): AgentInfo {
    const token = this.getAuthToken();
    return {
      provider: this.config.provider.name,
      model: this.config.provider.model,
      auth: {
        mode: token
          ? "token"
          : this.config.provider.auth.useLoggedInUser
            ? "logged-in-user"
            : "none",
        tokenType: this.config.provider.auth.tokenType,
        hasToken: Boolean(token)
      },
      instructions: this.config.provider.instructions,
      customAgents: this.config.provider.customAgents,
      skillDirectories: this.config.provider.skillDirectories,
      disabledSkills: this.config.provider.disabledSkills,
      mcpServers: this.config.provider.mcpServers,
      permissions: this.config.provider.permissions,
      persistence: {
        enabled: false,
        scope: "memory-only"
      }
    };
  }

  async createSession(): Promise<AgentSession> {
    const client = await this.getClient();
    await this.ensureAuthPreflight(client);
    this.log("Creating Copilot session", {
      model: this.config.provider.model,
      auth: this.getSafeAuthInfo(),
      customAgentCount: this.config.provider.customAgents.length,
      skillDirectoryCount: this.config.provider.skillDirectories.length,
      mcpServerCount: Object.keys(this.config.provider.mcpServers).length
    });

    const id = nanoid();
    let session: CopilotSession;
    try {
      session = await client.createSession({
        sessionId: id,
        model: this.config.provider.model,
        streaming: true,
        systemMessage: {
          mode: "append",
          content: this.config.provider.instructions
        },
        customAgents: this.config.provider.customAgents,
        skillDirectories: this.config.provider.skillDirectories,
        disabledSkills: this.config.provider.disabledSkills,
        mcpServers: this.config.provider.mcpServers,
        onPermissionRequest: async () => ({ kind: "approved" }),
        onUserInputRequest: (request: UserInputRequest) => this.requestUserInput(id, request)
      });
    } catch (error) {
      this.logError("Failed to create Copilot session", error);
      throw error;
    }

    this.sessions.set(id, session);
    this.log("Created Copilot session", { sessionId: id });
    return {
      id,
      createdAt: new Date().toISOString()
    };
  }

  async *sendMessageStream(sessionId: string, prompt: string): AsyncIterable<AgentStreamEvent> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      yield { type: "error", message: "Unknown or expired session." };
      return;
    }

    const queue = createAsyncQueue<AgentStreamEvent>();
    const runStats: MessageRunStats = {
      assistantText: "",
      toolEventCount: 0
    };
    this.activeRuns.set(sessionId, { queue, stats: runStats });
    const unsubscribeEvents = session.on((event) => {
      if (event.type === "assistant.message") {
        const content = extractAssistantMessageContent(event);
        runStats.assistantText += content;
        this.log("Received assistant message", {
          sessionId,
          contentLength: content.length
        });
        const activity = parseCopilotActivity(event);
        if (activity) {
          queue.push(activity);
        }
        return;
      }

      if (isCopilotToolEvent(event)) {
        runStats.toolEventCount += 1;
        this.log("Received tool event", {
          sessionId,
          eventType: event.type
        });
        const activity = parseCopilotActivity(event);
        if (activity) {
          queue.push(activity);
        }
        return;
      }

      const activity = parseCopilotActivity(event);
      if (activity) {
        queue.push(activity);
      }
    });
    const unsubscribeDelta = session.on("assistant.message_delta", (event) => {
      const content = extractAssistantDelta(event);
      if (content) {
        runStats.assistantText += content;
        this.log("Received assistant delta", {
          sessionId,
          contentLength: content.length
        });
        queue.push({ type: "delta", content });
      }
    });
    const unsubscribeError = session.on("error", (event) => {
      const message = event.data?.message ?? "Agent stream failed.";
      this.log("Received Copilot stream error", { sessionId, message });
      queue.push({ type: "error", message });
    });

    this.log("Sending message to Copilot session", {
      sessionId,
      promptLength: prompt.length
    });

    void session
      .sendAndWait({ prompt })
      .then(async () => {
        if (this.shouldAutoContinue(runStats)) {
          const continuationPrompt =
            "继续执行刚才的任务。不要只说明计划或说请稍等；请直接使用可用工具推进，直到完成、需要用户确认，或遇到无法自行解决的阻塞。";
          this.log("Auto-continuing placeholder Copilot response", {
            sessionId,
            assistantTextLength: runStats.assistantText.length
          });
          queue.push({ type: "delta", content: "\n\n" });
          await session.sendAndWait({ prompt: continuationPrompt, mode: "immediate" });
        }

        this.log("Copilot session completed message", {
          sessionId,
          toolEventCount: runStats.toolEventCount,
          assistantTextLength: runStats.assistantText.length
        });
        queue.push({ type: "done" });
        queue.end();
      })
      .catch((error: unknown) => {
        this.logError("Copilot session failed message", error, { sessionId });
        queue.push({ type: "error", message: error instanceof Error ? error.message : "Agent request failed." });
        queue.end();
      });

    try {
      yield* queue;
    } finally {
      this.activeRuns.delete(sessionId);
      unsubscribeEvents?.();
      unsubscribeDelta?.();
      unsubscribeError?.();
    }
  }

  async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    this.sessions.delete(sessionId);
    this.activeRuns.delete(sessionId);
    for (const [requestId, pending] of this.pendingUserInputs.entries()) {
      if (pending.sessionId === sessionId) {
        this.pendingUserInputs.delete(requestId);
      }
    }
    await session?.disconnect?.();
  }

  async respondToUserInput(sessionId: string, requestId: string, answer: string): Promise<boolean> {
    const pending = this.pendingUserInputs.get(requestId);
    if (!pending || pending.sessionId !== sessionId) {
      return false;
    }

    this.pendingUserInputs.delete(requestId);
    this.activeRuns.get(sessionId)?.queue.push({ type: "input_response", requestId, answer });
    pending.resolve({ answer, wasFreeform: true });
    return true;
  }

  async stop(): Promise<void> {
    await Promise.all([...this.sessions.keys()].map((sessionId) => this.closeSession(sessionId)));
    const client = await this.clientPromise;
    await client?.stop();
  }

  private async getClient(): Promise<CopilotClientLike> {
    this.clientPromise ??= import("@github/copilot-sdk").then(
      ({ CopilotClient }) =>
        new CopilotClient({
          githubToken: this.getAuthToken(),
          useLoggedInUser: this.config.provider.auth.useLoggedInUser
        }) as unknown as CopilotClientLike
    );
    return this.clientPromise;
  }

  private getAuthToken(): string | undefined {
    return this.config.provider.auth.token || this.config.provider.auth.githubToken || undefined;
  }

  private async ensureAuthPreflight(client: CopilotClientLike): Promise<void> {
    this.authPreflightPromise ??= (async () => {
      this.log("Running Copilot auth preflight", {
        auth: this.getSafeAuthInfo()
      });

      try {
        await client.start();
        const models = await client.listModels();
        this.log("Copilot auth preflight passed", {
          modelCount: models.length,
          firstModels: models
            .map((model) => model.id)
            .filter(Boolean)
            .slice(0, 5)
        });
      } catch (error) {
        this.authPreflightPromise = undefined;
        this.logError("Copilot auth preflight failed", error, {
          auth: this.getSafeAuthInfo()
        });
        throw error;
      }
    })();

    return this.authPreflightPromise;
  }

  private getSafeAuthInfo() {
    const token = this.getAuthToken();
    return {
      mode: token ? "token" : this.config.provider.auth.useLoggedInUser ? "logged-in-user" : "none",
      tokenType: this.config.provider.auth.tokenType,
      hasToken: Boolean(token),
      tokenLength: token?.length ?? 0,
      useLoggedInUser: this.config.provider.auth.useLoggedInUser
    };
  }

  private shouldAutoContinue(stats: MessageRunStats): boolean {
    if (stats.toolEventCount > 0) {
      return false;
    }

    const text = stats.assistantText.trim();
    if (!text || text.length > 220) {
      return false;
    }

    if (/(确认|是否|可以吗|要我|需要你|需要您|please confirm|confirm)/i.test(text)) {
      return false;
    }

    return /(我会|我先|将会|准备|开始|稍等|请稍等|一步步|完成流程|继续|I'll|I will|let me|one moment)/i.test(text);
  }

  private requestUserInput(
    sessionId: string,
    request: UserInputRequest
  ): Promise<{ answer: string; wasFreeform: boolean }> {
    const requestId = nanoid();
    const run = this.activeRuns.get(sessionId);
    this.log("Copilot requested user input", {
      sessionId,
      requestId,
      questionLength: request.question.length,
      choiceCount: request.choices?.length ?? 0
    });

    if (!run) {
      return Promise.reject(new Error("User input requested outside an active message stream."));
    }

    run.queue.push({
      type: "input_request",
      requestId,
      question: request.question,
      choices: request.choices,
      allowFreeform: request.allowFreeform ?? true
    });

    return new Promise((resolve) => {
      this.pendingUserInputs.set(requestId, { sessionId, resolve });
    });
  }

  private log(message: string, details?: Record<string, unknown>): void {
    console.info("[github-copilot-provider]", message, details ?? {});
  }

  private logError(message: string, error: unknown, details?: Record<string, unknown>): void {
    console.error("[github-copilot-provider]", message, {
      ...details,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

function createAsyncQueue<T>(): AsyncIterable<T> & { push: (item: T) => void; end: () => void } {
  const items: T[] = [];
  const resolvers: Array<(result: IteratorResult<T>) => void> = [];
  let ended = false;

  return {
    push(item: T) {
      const resolve = resolvers.shift();
      if (resolve) {
        resolve({ value: item, done: false });
        return;
      }

      items.push(item);
    },
    end() {
      ended = true;
      const resolve = resolvers.shift();
      resolve?.({ value: undefined, done: true });
    },
    [Symbol.asyncIterator]() {
      return {
        next() {
          const item = items.shift();
          if (item) {
            return Promise.resolve({ value: item, done: false });
          }

          if (ended) {
            return Promise.resolve({ value: undefined, done: true });
          }

          return new Promise<IteratorResult<T>>((resolve) => resolvers.push(resolve));
        }
      };
    }
  };
}
