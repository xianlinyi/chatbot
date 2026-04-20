import { nanoid } from "nanoid";
import type { AppConfig } from "../config/types.js";
import type { AgentInfo, AgentProvider, AgentSession, AgentStreamEvent } from "./types.js";

type CopilotSession = {
  on: (eventType: string, handler: (event: CopilotEvent) => void) => (() => void) | void;
  sendAndWait: (input: { prompt: string }) => Promise<unknown>;
  disconnect?: () => Promise<void>;
};

type CopilotClientLike = {
  createSession: (config: Record<string, unknown>) => Promise<CopilotSession>;
  stop: () => Promise<void>;
};

type CopilotEvent = {
  type?: string;
  data?: {
    deltaContent?: string;
    content?: string;
    message?: string;
  };
};

export class GithubCopilotAgentProvider implements AgentProvider {
  private readonly sessions = new Map<string, CopilotSession>();
  private clientPromise: Promise<CopilotClientLike> | undefined;

  constructor(private readonly config: AppConfig) {}

  getInfo(): AgentInfo {
    return {
      provider: this.config.provider.name,
      model: this.config.provider.model,
      auth: {
        mode: this.config.provider.auth.githubToken
          ? "github-token"
          : this.config.provider.auth.useLoggedInUser
            ? "logged-in-user"
            : "none",
        githubTokenEnv: this.config.provider.auth.githubTokenEnv,
        hasGithubToken: Boolean(this.config.provider.auth.githubToken)
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
    const session = await client.createSession({
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
      onPermissionRequest: async () => ({ kind: "approved" })
    });
    const id = nanoid();
    this.sessions.set(id, session);
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
    const unsubscribeDelta = session.on("assistant.message_delta", (event) => {
      const content = event.data?.deltaContent ?? event.data?.content ?? "";
      if (content) {
        queue.push({ type: "delta", content });
      }
    });
    const unsubscribeError = session.on("error", (event) => {
      queue.push({ type: "error", message: event.data?.message ?? "Agent stream failed." });
    });

    void session
      .sendAndWait({ prompt })
      .then(() => {
        queue.push({ type: "done" });
        queue.end();
      })
      .catch((error: unknown) => {
        queue.push({ type: "error", message: error instanceof Error ? error.message : "Agent request failed." });
        queue.end();
      });

    try {
      yield* queue;
    } finally {
      unsubscribeDelta?.();
      unsubscribeError?.();
    }
  }

  async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    this.sessions.delete(sessionId);
    await session?.disconnect?.();
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
          githubToken: this.config.provider.auth.githubToken,
          useLoggedInUser: this.config.provider.auth.useLoggedInUser
        }) as unknown as CopilotClientLike
    );
    return this.clientPromise;
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
