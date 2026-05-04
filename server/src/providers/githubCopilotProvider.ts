import { nanoid } from "nanoid";
import type { AppConfig } from "../config/types.js";
import type {
  AgentInfo,
  AgentProvider,
  AgentSession,
  AgentStreamEvent,
  ElicitationContext,
  ElicitationFieldValue,
  ElicitationResult,
  ElicitationSchema
} from "./types.js";
import type { CopilotEvent } from "./copilotResponseParser.js";
import { AgentWorkflowMonitor } from "../workflow/AgentWorkflowMonitor.js";
import { workflowInstruction } from "../skills/AgentSkillWorkflows.js";

type CopilotSession = {
  on: {
    (eventType: string, handler: (event: CopilotEvent) => void): (() => void) | void;
    (handler: (event: CopilotEvent) => void): (() => void) | void;
  };
  send: (input: { prompt: string; mode?: "enqueue" | "immediate" }) => Promise<string>;
  sendAndWait: (input: { prompt: string; mode?: "enqueue" | "immediate" }, timeout?: number) => Promise<unknown>;
  capabilities?: {
    ui?: {
      elicitation?: boolean;
    };
  };
  ui?: {
    elicitation: (params: { message: string; requestedSchema: ElicitationSchema }) => Promise<ElicitationResult>;
  };
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

type PendingElicitation = {
  sessionId: string;
  resolve: (result: ElicitationResult) => void;
};

type AsyncQueue<T> = AsyncIterable<T> & { push: (item: T) => void; end: () => void };

const RESPONSE_IDLE_TIMEOUT_MS = 10 * 60 * 1000;
const WORKFLOW_STEP_GATE_ATTEMPTS = 20;

export class GithubCopilotAgentProvider implements AgentProvider {
  private readonly sessions = new Map<string, CopilotSession>();
  private readonly activeRuns = new Map<string, ActiveRun>();
  private readonly pendingUserInputs = new Map<string, PendingUserInput>();
  private readonly pendingElicitations = new Map<string, PendingElicitation>();
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
          content: appendAgentWorkflowInstructions(
            this.config.provider.instructions,
            workflowInstruction(this.config.provider.skillWorkflows)
          )
        },
        customAgents: this.config.provider.customAgents,
        skillDirectories: this.config.provider.skillDirectories,
        disabledSkills: this.config.provider.disabledSkills,
        mcpServers: this.config.provider.mcpServers,
        // Runtime workflow gating is fully server-side. Tool permissions are auto-approved here so
        // no workflow step waits on a frontend approval button.
        onPermissionRequest: async () => ({ kind: "approved" }),
        onUserInputRequest: (request: UserInputRequest) => this.requestUserInput(id, request),
        onElicitationRequest: (context: ElicitationContext) => this.handleElicitationRequest(context)
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
    const workflowMonitor = new AgentWorkflowMonitor(this.config.provider.skillWorkflows);
    const runStats: MessageRunStats = {
      toolEventCount: 0
    };
    this.activeRuns.set(sessionId, { queue, stats: runStats });
    const unsubscribeEvents = session.on((event) => {
      if (!event.type) {
        return;
      }

      if (event.type.startsWith("tool.")) {
        runStats.toolEventCount += 1;
      }

      this.log("Received Copilot event", {
        sessionId,
        eventType: event.type
      });
      const streamEvent: AgentStreamEvent = { type: "copilot_event", eventType: event.type, data: event.data ?? {} };
      queue.push(streamEvent);
      for (const monitorEvent of workflowMonitor.observe(streamEvent)) {
        queue.push(monitorEvent);
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

    void (async () => {
      await session.sendAndWait({ prompt }, RESPONSE_IDLE_TIMEOUT_MS);

      for (let attempt = 1; attempt <= WORKFLOW_STEP_GATE_ATTEMPTS; attempt += 1) {
        for (const confirmEvent of workflowMonitor.confirmationEvents()) {
          queue.push(confirmEvent);
        }

        const nextReports = workflowMonitor.nextStepReports();
        if (nextReports.length === 0) {
          break;
        }

        queue.push({
          type: "assistant_event",
          eventType: "workflow.step_gate_opened",
          data: {
            attempt,
            skills: nextReports.map((report) => report.skill),
            nextSteps: Object.fromEntries(
              nextReports.map((report) => [report.skill, report.steps.map((step) => step.id)])
            )
          }
        });

        this.log("Opening next Copilot workflow step gate", {
          sessionId,
          attempt,
          nextReports
        });

        await session.sendAndWait(
          { prompt: workflowMonitor.nextStepPrompt(nextReports), mode: "immediate" },
          RESPONSE_IDLE_TIMEOUT_MS
        );
      }

      for (const confirmEvent of workflowMonitor.confirmationEvents()) {
        queue.push(confirmEvent);
      }
    })()
      .then(() => {
        this.log("Copilot session completed message", {
          sessionId,
          toolEventCount: runStats.toolEventCount
        });
        for (const monitorEvent of workflowMonitor.finishEvents()) {
          queue.push(monitorEvent);
        }
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
      unsubscribeError?.();
    }
  }

  async sendMessageText(sessionId: string, prompt: string): Promise<string> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error("Unknown or expired session.");
    }

    this.log("Sending text-only message to Copilot session", {
      sessionId,
      promptLength: prompt.length
    });

    const result = await session.send({ prompt });
    return typeof result === "string" ? result.trim() : "";
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
    for (const [requestId, pending] of this.pendingElicitations.entries()) {
      if (pending.sessionId === sessionId) {
        this.pendingElicitations.delete(requestId);
      }
    }
    await session?.disconnect?.();
  }

  async enqueuePrompt(sessionId: string, prompt: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    const run = this.activeRuns.get(sessionId);
    if (!session || !run) {
      return false;
    }

    this.log("Enqueuing prompt for active Copilot session", {
      sessionId,
      promptLength: prompt.length
    });

    await session.send({ prompt, mode: "enqueue" });
    return true;
  }

  async respondToUserInput(
    sessionId: string,
    requestId: string,
    answer: string,
    wasFreeform: boolean
  ): Promise<boolean> {
    const pending = this.pendingUserInputs.get(requestId);
    if (!pending || pending.sessionId !== sessionId) {
      return false;
    }

    this.pendingUserInputs.delete(requestId);
    pending.resolve({ answer, wasFreeform });
    return true;
  }

  async respondToElicitation(sessionId: string, requestId: string, result: ElicitationResult): Promise<boolean> {
    const pending = this.pendingElicitations.get(requestId);
    if (!pending || pending.sessionId !== sessionId) {
      return false;
    }

    this.pendingElicitations.delete(requestId);
    pending.resolve(result);
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

  private requestUserInput(
    sessionId: string,
    request: UserInputRequest
  ): Promise<{ answer: string; wasFreeform: boolean }> {
    const session = this.sessions.get(sessionId);
    if (session?.ui?.elicitation) {
      return this.requestUserInputViaElicitation(sessionId, session, request);
    }

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

  private async requestUserInputViaElicitation(
    sessionId: string,
    session: CopilotSession,
    request: UserInputRequest
  ): Promise<{ answer: string; wasFreeform: boolean }> {
    const choices = request.choices?.filter((choice) => choice.length > 0) ?? [];
    const allowFreeform = request.allowFreeform ?? true;
    this.log("Requesting user input through elicitation RPC", {
      sessionId,
      questionLength: request.question.length,
      choiceCount: choices.length,
      allowFreeform
    });

    const result = await session.ui!.elicitation({
      message: request.question,
      requestedSchema: createUserInputElicitationSchema(request.question, choices, allowFreeform)
    });

    if (result.action !== "accept") {
      return { answer: result.action, wasFreeform: true };
    }

    const content = result.content ?? {};
    const freeformAnswer = stringField(content, "answer");
    const selectedAnswer = stringField(content, "selection");
    const answer = freeformAnswer || selectedAnswer || "";
    if (!answer) {
      return { answer: "cancel", wasFreeform: true };
    }

    return {
      answer,
      wasFreeform: Boolean(freeformAnswer) || !choices.includes(answer)
    };
  }

  private handleElicitationRequest(context: ElicitationContext): Promise<ElicitationResult> {
    const requestId = nanoid();
    const sessionId = context.sessionId;
    const run = this.activeRuns.get(sessionId);
    this.log("Copilot requested elicitation", {
      sessionId,
      requestId,
      mode: context.mode ?? "form",
      source: context.elicitationSource,
      hasSchema: Boolean(context.requestedSchema)
    });

    if (!run) {
      return Promise.resolve({ action: "cancel" });
    }

    run.queue.push({
      type: "elicitation_request",
      requestId,
      message: context.message,
      requestedSchema: context.requestedSchema,
      mode: context.mode,
      elicitationSource: context.elicitationSource,
      url: context.url
    });

    return new Promise((resolve) => {
      this.pendingElicitations.set(requestId, { sessionId, resolve });
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

function appendAgentWorkflowInstructions(instructions: string, workflowInstructions: string): string {
  if (!workflowInstructions) return instructions;
  return `${instructions}\n\n${workflowInstructions}`;
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

function createUserInputElicitationSchema(
  question: string,
  choices: string[],
  allowFreeform: boolean
): ElicitationSchema {
  if (choices.length && allowFreeform) {
    return {
      type: "object",
      properties: {
        selection: {
          type: "string",
          title: "选择",
          description: question,
          enum: choices
        },
        answer: {
          type: "string",
          title: "自定义输入",
          description: "如果上面的选项不合适，可以填写自定义回答。",
          minLength: 1
        }
      }
    };
  }

  if (choices.length) {
    return {
      type: "object",
      properties: {
        selection: {
          type: "string",
          title: "选择",
          description: question,
          enum: choices
        }
      },
      required: ["selection"]
    };
  }

  return {
    type: "object",
    properties: {
      answer: {
        type: "string",
        title: "回答",
        description: question,
        minLength: 1
      }
    },
    required: ["answer"]
  };
}

function stringField(content: Record<string, ElicitationFieldValue>, key: string): string {
  const value = content[key];
  return typeof value === "string" ? value.trim() : "";
}
