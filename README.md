# Local Agent Chatbot

A deployable local-agent chat service with a React chat UI, Fastify API, and a provider layer. The first provider uses the GitHub Copilot SDK.

## Requirements

- Node.js 20 or newer
- A GitHub token available to the backend host. By default `agent.config.json` reads `GITHUB_TOKEN`.

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. The frontend proxies `/api` to the backend port configured in `agent.config.json` or `PORT`.

## Production

```bash
npm run build
npm run start
```

The production server serves the built frontend and API from the configured host and port.

## Configuration

Defaults live in `agent.config.json` and can be overridden with environment variables:

- `PORT`, default `3000`
- `HOST`, default `0.0.0.0`
- `AGENT_PROVIDER`, default `github-copilot`
- `COPILOT_MODEL`, default `gpt-4.1`
- `COPILOT_GITHUB_TOKEN`, `GITHUB_TOKEN`, or `GH_TOKEN` override the configured token source

Important `agent.config.json` fields:

- `server.host` and `server.port` control the production server listener.
- `provider.auth.githubTokenEnv` names the environment variable that contains the GitHub token.
- `provider.auth.githubToken` can hold a literal token for local experiments, but environment variables are safer.
- `provider.auth.useLoggedInUser` defaults to `false` so GitHub token authentication is explicit.

The app intentionally does not persist chat history. The frontend does not create a backend agent session until the first message is sent. Sessions disappear on idle expiry or server restart.

The chat API is `POST /api/messages` with `{ "sessionId": "optional-existing-id", "message": "..." }`. The response is `text/event-stream`; the first frame includes the active session ID.

At startup, the server logs the active provider, model, instructions, custom agents, skills, MCP servers, permission mode, and persistence status. Secret-looking fields are redacted before logging.

## Docker

```bash
docker build -t local-agent-chatbot .
docker run --rm -p 3000:3000 local-agent-chatbot
```

Provide Copilot/GitHub credentials to the container environment as required by your chosen authentication method.
