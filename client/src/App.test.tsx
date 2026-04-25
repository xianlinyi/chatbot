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
              controller.enqueue(
                encoder.encode(
                  'event: copilot_event\ndata: {"type":"copilot_event","eventType":"assistant.usage","data":{"inputTokens":100,"outputTokens":50,"cacheReadTokens":20,"apiCallId":"usage-1"}}\n\n'
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
    expect(await screen.findByText("Tokens 150 · In 100 · Out 50 · Cache 20")).toBeInTheDocument();
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

  it("switches the send button to stop while a response is streaming", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === "/api/agent-info") {
        return jsonResponse({
          app: { name: "Test Chatbot", icon: "spark" },
          agent: {
            provider: "github-copilot",
            model: "test-model",
            auth: { mode: "token", tokenType: "fine-grained-pat", hasToken: true },
            instructions: undefined,
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
            }
          }),
          {
            status: 200,
            headers: { "Content-Type": "text/event-stream" }
          }
        );
      }

      if (url === "/api/stop" && init?.method === "POST") {
        return jsonResponse({ ok: true });
      }

      return new Response(null, { status: 204 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await screen.findByText("github-copilot · test-model · token");
    await userEvent.type(screen.getByLabelText("Message"), "Hi");
    await userEvent.keyboard("{Enter}");

    const stopButton = await screen.findByRole("button", { name: "Stop response" });
    expect(document.body.classList.contains("request-active")).toBe(true);

    await userEvent.click(stopButton);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/stop",
        expect.objectContaining({
          method: "POST"
        })
      )
    );
    expect(await screen.findByRole("button", { name: "Send message" })).toBeInTheDocument();
  });

  it("keeps the composer editable and enqueues prompts while a response is streaming", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === "/api/agent-info") {
        return jsonResponse({
          app: { name: "Test Chatbot", icon: "spark" },
          agent: {
            provider: "github-copilot",
            model: "test-model",
            auth: { mode: "token", tokenType: "fine-grained-pat", hasToken: true },
            instructions: undefined,
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
            }
          }),
          {
            status: 200,
            headers: { "Content-Type": "text/event-stream" }
          }
        );
      }

      if (url === "/api/prompts" && init?.method === "POST") {
        return jsonResponse({ ok: true });
      }

      return new Response(null, { status: 204 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await screen.findByText("github-copilot · test-model · token");
    const input = screen.getByLabelText("Message");
    await userEvent.type(input, "Hi");
    await userEvent.keyboard("{Enter}");
    await screen.findByRole("button", { name: "Stop response" });

    expect(input).not.toBeDisabled();
    await userEvent.type(input, "Add tests");
    await userEvent.keyboard("{Enter}");

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/prompts",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ sessionId: "session-1", message: "Add tests" })
        })
      )
    );
    expect(await screen.findByText("Add tests")).toBeInTheDocument();
  });

  it("renders assistant responses as markdown", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === "/api/agent-info") {
        return jsonResponse({
          app: { name: "Test Chatbot", icon: "spark" },
          agent: {
            provider: "github-copilot",
            model: "test-model",
            auth: { mode: "token", tokenType: "fine-grained-pat", hasToken: true },
            instructions: undefined,
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
              controller.enqueue(
                encoder.encode(
                  'event: delta\ndata: {"type":"delta","content":"**hello** world"}\n\n'
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

    await screen.findByText("github-copilot · test-model · token");
    await userEvent.type(screen.getByLabelText("Message"), "Hi");
    await userEvent.keyboard("{Enter}");

    const boldText = await screen.findByText("hello");
    expect(boldText.tagName).toBe("STRONG");
    expect(screen.getByText("world")).toBeInTheDocument();
  });

  it("returns clicked input choices to Copilot as non-freeform answers", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === "/api/agent-info") {
        return jsonResponse({
          app: { name: "Test Chatbot", icon: "spark" },
          agent: {
            provider: "github-copilot",
            model: "test-model",
            auth: { mode: "token", tokenType: "fine-grained-pat", hasToken: true },
            instructions: undefined,
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
              controller.enqueue(
                encoder.encode(
                  'event: input_request\ndata: {"type":"input_request","requestId":"request-1","question":"请选择部署环境","choices":["staging","production"],"allowFreeform":true}\n\n'
                )
              );
            }
          }),
          {
            status: 200,
            headers: { "Content-Type": "text/event-stream" }
          }
        );
      }

      if (url === "/api/user-input" && init?.method === "POST") {
        return jsonResponse({ ok: true });
      }

      return new Response(null, { status: 204 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await screen.findByText("github-copilot · test-model · token");
    await userEvent.type(screen.getByLabelText("Message"), "Hi");
    await userEvent.keyboard("{Enter}");
    expect(document.body.classList.contains("request-active")).toBe(true);
    expect(await screen.findByRole("button", { name: "Send message" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Stop response" })).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: "production" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/user-input",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            sessionId: "session-1",
            requestId: "request-1",
            answer: "production",
            wasFreeform: false
          })
        })
      )
    );
    expect(document.querySelectorAll("article.message.user")).toHaveLength(1);
  });

  it("applies the assistant event filter to mock display data", () => {
    render(<App />);

    return waitFor(() => {
      const assistantMessage = document.querySelector("article.message.assistant");
      expect(assistantMessage).not.toBeNull();
      expect(assistantMessage?.textContent).toContain("请求工具");
      expect(assistantMessage?.querySelector(".assistant-turn")).not.toBeNull();
    });
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
