import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AppConfig } from "./config/types.js";
import type { AgentProvider } from "./providers/types.js";
import { registerApi } from "./routes/api.js";
import { SessionManager } from "./sessions/sessionManager.js";

type BuildAppOptions = {
  config: AppConfig;
  provider: AgentProvider;
};

export async function buildApp({ config, provider }: BuildAppOptions) {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info"
    }
  });
  const sessions = new SessionManager(provider);
  sessions.startCleanup();

  app.addHook("onClose", async () => {
    await sessions.stop();
    await provider.stop();
  });

  await app.register(cors, {
    origin: true
  });
  await app.register(registerApi, {
    config,
    provider,
    sessions
  });

  const staticRoot = getStaticRoot();
  const hasStaticBuild = existsSync(path.join(staticRoot, "index.html"));
  if (hasStaticBuild) {
    await app.register(fastifyStatic, {
      root: staticRoot,
      prefix: "/"
    });
  }

  app.setNotFoundHandler((request, reply) => {
    if (request.raw.url?.startsWith("/api/")) {
      return reply.code(404).send({ error: "Not found." });
    }

    if (hasStaticBuild) {
      return reply.sendFile("index.html");
    }

    return reply.code(404).send({ error: "Frontend build not found. Run npm run build or use npm run dev." });
  });

  return app;
}

function getStaticRoot(): string {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentFile);
  return path.resolve(currentDir, "../../dist/client");
}
