import type { AgentProvider, AgentStreamEvent, ElicitationResult } from "../providers/types.js";

export type ChatSessionRecord = {
  id: string;
  createdAt: string;
  lastSeenAt: number;
};

export class SessionManager {
  private readonly sessions = new Map<string, ChatSessionRecord>();
  private cleanupTimer: NodeJS.Timeout | undefined;

  constructor(
    private readonly provider: AgentProvider,
    private readonly idleTtlMs = 10 * 60 * 1000
  ) {}

  async create(): Promise<ChatSessionRecord> {
    const agentSession = await this.provider.createSession();
    const session = {
      id: agentSession.id,
      createdAt: agentSession.createdAt,
      lastSeenAt: Date.now()
    };
    this.sessions.set(session.id, session);
    return session;
  }

  get(sessionId: string): ChatSessionRecord | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return undefined;
    }

    session.lastSeenAt = Date.now();
    return session;
  }

  async sendMessageStream(sessionId: string, prompt: string): Promise<AsyncIterable<AgentStreamEvent> | undefined> {
    const session = this.get(sessionId);
    if (!session) {
      return undefined;
    }

    return this.provider.sendMessageStream(sessionId, prompt);
  }

  async enqueuePrompt(sessionId: string, prompt: string): Promise<boolean> {
    const session = this.get(sessionId);
    if (!session) {
      return false;
    }

    return this.provider.enqueuePrompt(sessionId, prompt);
  }

  async respondToUserInput(
    sessionId: string,
    requestId: string,
    answer: string,
    wasFreeform: boolean
  ): Promise<boolean> {
    const session = this.get(sessionId);
    if (!session) {
      return false;
    }

    return this.provider.respondToUserInput(sessionId, requestId, answer, wasFreeform);
  }

  async respondToElicitation(sessionId: string, requestId: string, result: ElicitationResult): Promise<boolean> {
    const session = this.get(sessionId);
    if (!session) {
      return false;
    }

    return this.provider.respondToElicitation(sessionId, requestId, result);
  }

  async delete(sessionId: string): Promise<boolean> {
    const existed = this.sessions.delete(sessionId);
    if (existed) {
      await this.provider.closeSession(sessionId);
    }

    return existed;
  }

  size(): number {
    return this.sessions.size;
  }

  startCleanup(intervalMs = 60_000): void {
    this.cleanupTimer ??= setInterval(() => {
      void this.cleanupExpired();
    }, intervalMs);
    this.cleanupTimer.unref();
  }

  async stop(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }

    await Promise.all([...this.sessions.keys()].map((sessionId) => this.delete(sessionId)));
  }

  async cleanupExpired(now = Date.now()): Promise<number> {
    const expired = [...this.sessions.values()].filter((session) => now - session.lastSeenAt > this.idleTtlMs);
    await Promise.all(expired.map((session) => this.delete(session.id)));
    return expired.length;
  }
}
