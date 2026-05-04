import { loadConfig } from "./config/loadConfig.js";
import { buildApp } from "./app.js";
import { createProvider } from "./providers/createProvider.js";
import { resolveAgentSkillDirectories } from "./skills/AgentSkillDirectories.js";
import { loadAgentSkillWorkflows } from "./skills/AgentSkillWorkflows.js";
import { redactSecrets } from "./utils/redact.js";

const config = await loadConfig();
config.provider.skillDirectories = await resolveAgentSkillDirectories(config, process.cwd());
config.provider.skillWorkflows = await loadAgentSkillWorkflows(config.provider.skillDirectories);
const provider = createProvider(config);
const app = await buildApp({ config, provider });
const { port, host } = config.server;

app.log.info(
  {
    app: config.app,
    server: config.server,
    agent: redactSecrets(provider.getInfo())
  },
  "Starting local agent chatbot"
);

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "Shutting down");
  await app.close();
};

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});
process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});

await app.listen({ port, host });
