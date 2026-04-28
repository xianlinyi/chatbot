import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config/types.js";
import type { ElicitationResult } from "../providers/types.js";
import type { AgentProvider } from "../providers/types.js";
import type { SessionManager } from "../sessions/sessionManager.js";
import { redactSecrets } from "../utils/redact.js";
import { optionalString, requiredString } from "./requestValidation.js";
import { writeSse } from "./sse.js";

type RegisterApiOptions = {
  config: AppConfig;
  provider: AgentProvider;
  sessions: SessionManager;
};

export async function registerApi(app: FastifyInstance, options: RegisterApiOptions): Promise<void> {
  app.get("/api/health", async () => ({
    ok: true,
    activeSessions: options.sessions.size()
  }));

  app.get("/api/agent-info", async () => ({
    app: options.config.app,
    agent: redactSecrets(options.provider.getInfo())
  }));

  app.post<{ Body: { sessionId?: unknown; message?: unknown } }>("/api/messages", async (request, reply) => {
    const message = requiredString(request.body?.message);
    if (!message) {
      return reply.code(400).send({ error: "Message must be a non-empty string." });
    }

    let sessionId = optionalString(request.body?.sessionId);
    let created = false;

    if (!sessionId || !options.sessions.get(sessionId)) {
      const session = await options.sessions.create();
      sessionId = session.id;
      created = true;
    }

    const stream = await options.sessions.sendMessageStream(sessionId, message);
    if (!stream) {
      return reply.code(404).send({ error: "Unknown or expired session." });
    }

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    });

    request.raw.on("close", () => {
      reply.raw.end();
    });

    writeSse(reply.raw, {
      type: "session",
      sessionId,
      created
    });

    for await (const event of stream) {
      if (reply.raw.destroyed) {
        break;
      }

      writeSse(reply.raw, event);
    }

    reply.raw.end();
  });

  app.post<{ Body: { sessionId?: unknown; message?: unknown } }>("/api/prompts", async (request, reply) => {
    const { sessionId, message } = request.body ?? {};
    const activeSessionId = requiredString(sessionId);
    const prompt = requiredString(message);
    if (!activeSessionId) {
      return reply.code(400).send({ error: "sessionId is required." });
    }
    if (!prompt) {
      return reply.code(400).send({ error: "Message must be a non-empty string." });
    }

    const accepted = await options.sessions.enqueuePrompt(activeSessionId, prompt);
    if (!accepted) {
      return reply.code(404).send({ error: "Unknown, expired, or inactive session." });
    }

    return { ok: true };
  });

  app.post<{ Body: { sessionId?: unknown; requestId?: unknown; answer?: unknown; wasFreeform?: unknown } }>(
    "/api/user-input",
    async (request, reply) => {
      const { sessionId, requestId, answer, wasFreeform } = request.body ?? {};
      const activeSessionId = requiredString(sessionId);
      const activeRequestId = requiredString(requestId);
      const responseText = requiredString(answer);
      if (!activeSessionId) {
        return reply.code(400).send({ error: "sessionId is required." });
      }
      if (!activeRequestId) {
        return reply.code(400).send({ error: "requestId is required." });
      }
      if (!responseText) {
        return reply.code(400).send({ error: "answer must be a non-empty string." });
      }

      const accepted = await options.sessions.respondToUserInput(
        activeSessionId,
        activeRequestId,
        responseText,
        typeof wasFreeform === "boolean" ? wasFreeform : true
      );
      if (!accepted) {
        return reply.code(404).send({ error: "Unknown or expired input request." });
      }

      return { ok: true };
    }
  );

  app.post<{ Body: { sessionId?: unknown; requestId?: unknown; result?: unknown } }>(
    "/api/elicitation",
    async (request, reply) => {
      const { sessionId, requestId, result } = request.body ?? {};
      const activeSessionId = requiredString(sessionId);
      const activeRequestId = requiredString(requestId);
      const elicitationResult = parseElicitationResult(result);
      if (!activeSessionId) {
        return reply.code(400).send({ error: "sessionId is required." });
      }
      if (!activeRequestId) {
        return reply.code(400).send({ error: "requestId is required." });
      }
      if (!elicitationResult) {
        return reply.code(400).send({ error: "result must be a valid elicitation response." });
      }

      const accepted = await options.sessions.respondToElicitation(activeSessionId, activeRequestId, elicitationResult);
      if (!accepted) {
        return reply.code(404).send({ error: "Unknown or expired elicitation request." });
      }

      return { ok: true };
    }
  );

  app.post<{ Body: { sessionId?: unknown } }>("/api/stop", async (request, reply) => {
    const requestedSessionId = optionalString(request.body?.sessionId);
    if (requestedSessionId) {
      const stopped = await options.sessions.delete(requestedSessionId);
      if (!stopped) {
        return reply.code(404).send({ error: "Unknown or expired session." });
      }

      return { ok: true };
    }

    await options.provider.stop();
    return { ok: true };
  });
}

function parseElicitationResult(value: unknown): ElicitationResult | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const result = value as { action?: unknown; content?: unknown };
  if (result.action !== "accept" && result.action !== "decline" && result.action !== "cancel") {
    return undefined;
  }

  if (result.content !== undefined && (!result.content || typeof result.content !== "object" || Array.isArray(result.content))) {
    return undefined;
  }

  return {
    action: result.action,
    content: result.content as ElicitationResult["content"]
  };
}
