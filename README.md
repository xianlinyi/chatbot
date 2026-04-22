# Local Agent Chatbot

A deployable local-agent chat service with a React chat UI, Fastify API, and a provider layer. The first provider uses the GitHub Copilot SDK.

## Requirements

- Node.js 20 or newer
- A GitHub Copilot-compatible token configured in `agent.config.json`.

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

Defaults live in `agent.config.json`. Server binding and model can be overridden with environment variables:

- `PORT`, default `3000`
- `HOST`, default `0.0.0.0`
- `AGENT_PROVIDER`, default `github-copilot`
- `COPILOT_MODEL`, default `gpt-4.1`

Important `agent.config.json` fields:

- `server.host` and `server.port` control the production server listener.
- `provider.auth.token` contains the Copilot-compatible token. Token authentication is read only from config, not from environment variables.
- `provider.auth.tokenType` declares the configured token kind. Supported values are `fine-grained-pat`, `copilot-cli-oauth`, and `github-cli-oauth`.
- `provider.auth.useLoggedInUser` defaults to `false` so GitHub token authentication is explicit.

GitHub Copilot SDK supports fine-grained personal access tokens with the "Copilot Requests" permission, OAuth tokens from the GitHub Copilot CLI app, and OAuth tokens from the GitHub CLI app. Classic personal access tokens with the `ghp_` prefix are not supported.

The app intentionally does not persist chat history. The frontend does not create a backend agent session until the first message is sent. Sessions disappear on idle expiry or server restart.

The chat API is `POST /api/messages` with `{ "sessionId": "optional-existing-id", "message": "..." }`. The response is `text/event-stream`; the first frame includes the active session ID.

At startup, the server logs the active provider, model, instructions, custom agents, skills, MCP servers, permission mode, and persistence status. Secret-looking fields are redacted before logging.

## Docker

```bash
docker build -t local-agent-chatbot .
docker run --rm -p 3000:3000 local-agent-chatbot
```

Provide Copilot/GitHub credentials in the container's `agent.config.json` or mount a config file that includes `provider.auth.token`.
