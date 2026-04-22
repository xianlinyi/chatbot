import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App.js";

const encoder = new TextEncoder();

describe("App", () => {
  beforeEach(() => {
    const cryptoLike = {
      randomUUID: vi.fn(function randomUUID(this: unknown) {
        if (this !== cryptoLike) {
          throw new TypeError("Illegal invocation");
        }

        return `id-${Math.random()}`;
      })
    };
    vi.stubGlobal("crypto", cryptoLike);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("creates a fresh session on load and streams a response", async () => {
    let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === "/api/agent-info") {
        return jsonResponse({
          app: { name: "Test Chatbot", icon: "spark" },
          agent: {
            provider: "github-copilot",
            model: "test-model",
            auth: { mode: "token", tokenType: "fine-grained-pat", hasToken: true },
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
              streamController = controller;
              controller.enqueue(
                encoder.encode('event: session\ndata: {"type":"session","sessionId":"session-1","created":true}\n\n')
              );
              controller.enqueue(
                encoder.encode(
                  'event: delta\ndata: {"type":"delta","content":"hello world"}\n\n'
                )
              );
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

    expect(await screen.findByText("github-copilot · test-model · token")).toBeInTheDocument();
    const input = screen.getByLabelText("Message");
    await userEvent.type(input, "Hi");
    await userEvent.keyboard("{Enter}");

    expect(await screen.findByText("Hi")).toBeInTheDocument();
    expect(await screen.findByText("hello world")).toBeInTheDocument();
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
