import { loadConfig } from "./config/loadConfig.js";
import { buildApp } from "./app.js";
import { createProvider } from "./providers/createProvider.js";
import { redactSecrets } from "./utils/redact.js";

const config = await loadConfig();
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
