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
                  'event: activity\ndata: {"type":"activity","event":{"type":"assistant.usage","data":{"model":"test-model","inputTokens":10,"outputTokens":4,"duration":1200}}}\n\n'
                )
              );
              controller.enqueue(
                encoder.encode(
                  'event: activity\ndata: {"type":"activity","event":{"type":"tool.execution_start","data":{"toolCallId":"tool-1","toolName":"bash","arguments":{"command":"git status --short"}}}}\n\n'
                )
              );
              controller.enqueue(
                encoder.encode(
                  'event: activity\ndata: {"type":"activity","event":{"type":"skill.invoked","data":{"name":"imagegen","description":"Generate images","path":"/skills/imagegen/SKILL.md","content":"secret skill body"}}}\n\n'
                )
              );
              controller.enqueue(
                encoder.encode(
                  'event: input_request\ndata: {"type":"input_request","requestId":"request-1","question":"选择提交类型？","choices":["feat","fix"],"allowFreeform":true}\n\n'
                )
              );
              controller.enqueue(
                encoder.encode(
                  'event: delta\ndata: {"type":"delta","content":"hello <skill><name>commit</name><description>Commit changes</description><content>hidden skill markdown</content></skill>"}\n\n'
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

      return new Response(null, { status: 204 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByText("github-copilot · test-model · token")).toBeInTheDocument();
    const input = screen.getByLabelText("Message");
    await userEvent.type(input, "Hi");
    await userEvent.keyboard("{Enter}");

    expect(await screen.findByText("Hi")).toBeInTheDocument();
    expect(await screen.findByText("hello")).toBeInTheDocument();
    expect(await screen.findByText("commit")).toBeInTheDocument();
    expect(await screen.findByText("imagegen")).toBeInTheDocument();
    expect(screen.queryByText(/hidden skill markdown/)).not.toBeInTheDocument();
    expect(screen.queryByText(/secret skill body/)).not.toBeInTheDocument();
    expect(await screen.findByText("正在调用工具 · bash")).toBeInTheDocument();
    expect(await screen.findByText(/git status --short/)).toBeInTheDocument();
    streamController?.enqueue(
      encoder.encode(
        'event: activity\ndata: {"type":"activity","event":{"type":"tool.execution_complete","data":{"toolCallId":"tool-1","toolName":"bash","success":true}}}\n\n'
      )
    );
    await waitFor(() => expect(screen.queryByText("正在调用工具 · bash")).not.toBeInTheDocument());
    streamController?.enqueue(encoder.encode('event: done\ndata: {"type":"done"}\n\n'));
    streamController?.close();
    expect(await screen.findByText("问题")).toBeInTheDocument();
    expect(await screen.findByText("选择提交类型？")).toBeInTheDocument();
    expect(await screen.findByText("选项")).toBeInTheDocument();
    expect(await screen.findByText("feat")).toBeInTheDocument();
    expect(screen.queryByText(/Model usage/)).not.toBeInTheDocument();
    expect(await screen.findByText(/本轮总计 14 tokens/)).toBeInTheDocument();
    expect(await screen.findByText(/Session 累计 14 tokens/)).toBeInTheDocument();
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
