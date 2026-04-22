import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config/types.js";
import type { AgentProvider, AgentStreamEvent } from "../providers/types.js";
import type { SessionManager } from "../sessions/sessionManager.js";
import { redactSecrets } from "../utils/redact.js";

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
    const message = request.body?.message;
    if (typeof message !== "string" || !message.trim()) {
      return reply.code(400).send({ error: "Message must be a non-empty string." });
    }

    const requestedSessionId = request.body?.sessionId;
    let sessionId = typeof requestedSessionId === "string" && requestedSessionId.trim() ? requestedSessionId : undefined;
    let created = false;

    if (!sessionId || !options.sessions.get(sessionId)) {
      const session = await options.sessions.create();
      sessionId = session.id;
      created = true;
    }

    const stream = await options.sessions.sendMessageStream(sessionId, message.trim());
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

  app.post<{ Body: { sessionId?: unknown; requestId?: unknown; answer?: unknown } }>(
    "/api/user-input",
    async (request, reply) => {
      const { sessionId, requestId, answer } = request.body ?? {};
      if (typeof sessionId !== "string" || !sessionId.trim()) {
        return reply.code(400).send({ error: "sessionId is required." });
      }
      if (typeof requestId !== "string" || !requestId.trim()) {
        return reply.code(400).send({ error: "requestId is required." });
      }
      if (typeof answer !== "string" || !answer.trim()) {
        return reply.code(400).send({ error: "answer must be a non-empty string." });
      }

      const accepted = await options.sessions.respondToUserInput(sessionId, requestId, answer.trim());
      if (!accepted) {
        return reply.code(404).send({ error: "Unknown or expired input request." });
      }

      return { ok: true };
    }
  );
}

function writeSse(response: NodeJS.WritableStream, event: AgentStreamEvent): void {
  response.write(`event: ${event.type}\n`);
  response.write(`data: ${JSON.stringify(event)}\n\n`);
}
