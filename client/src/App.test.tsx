import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App.js";

const encoder = new TextEncoder();

describe("App", () => {
  beforeEach(() => {
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => `id-${Math.random()}`)
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("creates a fresh session on load and streams a response", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === "/api/agent-info") {
        return jsonResponse({
          app: { name: "Test Chatbot", icon: "spark" },
          agent: {
            provider: "github-copilot",
            model: "test-model",
            auth: { mode: "github-token", githubTokenEnv: "GITHUB_TOKEN", hasGithubToken: true },
            instructions: "Test instructions",
            customAgents: [],
            skillDirectories: [],
            disabledSkills: [],
            mcpServers: {},
            permissions: { mode: "allow-all" },
            persistence: { enabled: false, scope: "memory-only" }
          }
        });
      }

      if (url === "/api/messages" && init?.method === "POST") {
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(
                encoder.encode('event: session\ndata: {"type":"session","sessionId":"session-1","created":true}\n\n')
              );
              controller.enqueue(encoder.encode('event: delta\ndata: {"type":"delta","content":"hello"}\n\n'));
              controller.enqueue(encoder.encode('event: done\ndata: {"type":"done"}\n\n'));
              controller.close();
            }
          }),
          {
            status: 200,
            headers: { "Content-Type": "text/event-stream" }
          }
        );
      }

      return new Response(null, { status: 204 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

  expect(await screen.findByText("James.bot")).toBeInTheDocument();
    const input = screen.getByLabelText("Message");
    await userEvent.type(input, "Hi");
    await userEvent.keyboard("{Enter}");

    expect(await screen.findByText("Hi")).toBeInTheDocument();
    expect(await screen.findByText("hello")).toBeInTheDocument();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/messages",
        expect.objectContaining({
          body: JSON.stringify({ sessionId: undefined, message: "Hi" }),
          method: "POST"
        })
      )
    );
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}
