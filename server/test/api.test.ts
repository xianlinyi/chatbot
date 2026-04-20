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
    expect(response.body).toContain('data: {"type":"delta","content":"hel"}');
    expect(response.body).toContain('data: {"type":"delta","content":"lo"}');
    expect(response.body).toContain('data: {"type":"done"}');

    await app.close();
  });

  it("returns redacted agent info", async () => {
    const app = await buildApp({ config: testConfig, provider: new MockAgentProvider() });
    const response = await app.inject({ method: "GET", url: "/api/agent-info" });
    const body = response.json();

    expect(body.agent.instructions).toBe("Test instructions");
    expect(body.agent.auth.hasGithubToken).toBe(true);
    expect(body.agent.skillDirectories).toEqual(["./skills"]);
    expect(body.agent.mcpServers.demo.headers.authorization).toBe("[REDACTED]");

    await app.close();
  });
});
