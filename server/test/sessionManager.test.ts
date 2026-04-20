import { describe, expect, it } from "vitest";
import { MockAgentProvider } from "./helpers.js";
import { SessionManager } from "../src/sessions/sessionManager.js";

describe("SessionManager", () => {
  it("creates, retrieves, expires, and deletes sessions", async () => {
    const provider = new MockAgentProvider();
    const manager = new SessionManager(provider, 10);

    const session = await manager.create();
    expect(manager.get(session.id)?.id).toBe(session.id);
    expect(manager.size()).toBe(1);

    const expired = await manager.cleanupExpired(Date.now() + 20);
    expect(expired).toBe(1);
    expect(manager.get(session.id)).toBeUndefined();
    expect(provider.closed.has(session.id)).toBe(true);
  });
});
