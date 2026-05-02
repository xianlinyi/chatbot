import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { MockAgentProvider, testConfig } from "./helpers.js";

describe("API routes", () => {
  it("rejects malformed messages", async () => {
    const app = await buildApp({ config: testConfig, provider: new MockAgentProvider() });

    const malformed = await app.inject({
      method: "POST",
      url: "/api/messages",
      payload: {}
    });
    expect(malformed.statusCode).toBe(400);

    await app.close();
  });

  it("creates a session lazily and streams agent chunks in order", async () => {
    const app = await buildApp({ config: testConfig, provider: new MockAgentProvider() });
    const response = await app.inject({
      method: "POST",
      url: "/api/messages",
      payload: { message: "hello" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/event-stream");
    expect(response.body).toContain('data: {"type":"session","sessionId":"session-1","created":true}');
    expect(response.body).toContain('"eventType":"runtime.state"');
    expect(response.body).toContain('"state":"TASK_STRUCTURED"');
    expect(response.body).toContain('"state":"SKILL_SELECTED"');
    expect(response.body).toContain('data: {"type":"delta","content":"hello"}');
    expect(response.body).toContain('data: {"type":"done"}');

    await app.close();
  });

  it("returns redacted agent info", async () => {
    const app = await buildApp({ config: testConfig, provider: new MockAgentProvider() });
    const response = await app.inject({ method: "GET", url: "/api/agent-info" });
    const body = response.json();

    expect(body.agent.instructions).toBe("Test instructions");
    expect(body.agent.auth.hasToken).toBe(true);
    expect(body.agent.auth.tokenType).toBe("fine-grained-pat");
    expect(body.agent.skillDirectories).toEqual(["./skills"]);
    expect(body.agent.mcpServers.demo.headers.authorization).toBe("[REDACTED]");

    await app.close();
  });

  it("forwards user input answers to the active agent session", async () => {
    const app = await buildApp({ config: testConfig, provider: new MockAgentProvider() });
    await app.inject({
      method: "POST",
      url: "/api/messages",
      payload: { message: "hello" }
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/user-input",
      payload: { sessionId: "session-1", requestId: "request-1", answer: "yes" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });

    await app.close();
  });

  it("forwards elicitation answers to the active agent session", async () => {
    const app = await buildApp({ config: testConfig, provider: new MockAgentProvider() });
    await app.inject({
      method: "POST",
      url: "/api/messages",
      payload: { message: "hello" }
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/elicitation",
      payload: {
        sessionId: "session-1",
        requestId: "elicitation-1",
        result: { action: "accept", content: { answer: "yes" } }
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });

    await app.close();
  });

  it("rejects malformed elicitation answers", async () => {
    const app = await buildApp({ config: testConfig, provider: new MockAgentProvider() });

    const response = await app.inject({
      method: "POST",
      url: "/api/elicitation",
      payload: { sessionId: "session-1", requestId: "elicitation-1", result: { action: "maybe" } }
    });

    expect(response.statusCode).toBe(400);

    await app.close();
  });

  it("enqueues prompts for an active agent session", async () => {
    const provider = new MockAgentProvider();
    const app = await buildApp({ config: testConfig, provider });
    await app.inject({
      method: "POST",
      url: "/api/messages",
      payload: { message: "hello" }
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/prompts",
      payload: { sessionId: "session-1", message: "keep going" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    expect(provider.prompts).toEqual([{ sessionId: "session-1", prompt: "keep going" }]);

    await app.close();
  });

  it("stops an active session", async () => {
    const provider = new MockAgentProvider();
    const app = await buildApp({ config: testConfig, provider });
    await app.inject({
      method: "POST",
      url: "/api/messages",
      payload: { message: "hello" }
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/stop",
      payload: { sessionId: "session-1" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    expect(provider.closed.has("session-1")).toBe(true);

    await app.close();
  });
});
