import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ContentRenderer } from "./ContentRenderer";

describe("ContentRenderer turn labels", () => {
  it("hides the normal thinking label after a completed turn", () => {
    const { container } = render(
      <ContentRenderer
        content=""
        events={[
          { type: "assistant_event", eventType: "assistant.turn_start", data: { turnId: 1 } },
          { type: "assistant_event", eventType: "assistant.message", data: { content: "完成后的回复" } },
          { type: "assistant_event", eventType: "assistant.turn_end", data: { turnId: 1 } }
        ]}
      />
    );

    expect(screen.queryByText("正在思考")).not.toBeInTheDocument();
    expect(screen.getByText("完成后的回复")).toBeInTheDocument();
  });

  it("shows ask_user status without rendering the question card in message history", () => {
    const { container, rerender } = render(
      <ContentRenderer
        content=""
        events={[
          { type: "assistant_event", eventType: "assistant.turn_start", data: { turnId: 1 } },
          {
            type: "input_request",
            eventType: "input_request",
            data: {
              requestId: "request-1",
              question: "请选择部署环境",
              choices: ["staging", "production"]
            }
          }
        ]}
      />
    );

    expect(screen.getByText("正在询问用户")).toHaveClass("active");
    expect(container.querySelector(".assistant-turn-card-shell")).toBeNull();
    expect(container.querySelector(".choice-request-card")).toBeNull();
    expect(screen.queryByText("请选择部署环境")).not.toBeInTheDocument();

    rerender(
      <ContentRenderer
        content=""
        events={[
          { type: "assistant_event", eventType: "assistant.turn_start", data: { turnId: 1 } },
          {
            type: "input_request",
            eventType: "input_request",
            data: {
              requestId: "request-1",
              question: "请选择部署环境",
              choices: ["staging", "production"]
            }
          },
          { type: "assistant_event", eventType: "assistant.turn_end", data: { turnId: 1 } }
        ]}
      />
    );

    expect(screen.getByText("询问用户")).not.toHaveClass("active");
    expect(container.querySelector(".assistant-turn-card-shell")).toBeNull();
    expect(container.querySelector(".choice-request-card")).toBeNull();
    expect(screen.queryByText("请选择部署环境")).not.toBeInTheDocument();
  });

  it("collapses a completed special turn and expands it from the triangle toggle", async () => {
    const user = userEvent.setup();

    const { container } = render(
      <ContentRenderer
        content=""
        events={[
          { type: "assistant_event", eventType: "assistant.turn_start", data: { turnId: 1 } },
          {
            type: "tool",
            eventType: "tool.execution_start",
            data: {
              toolCallId: "call-1",
              toolName: "bash",
              arguments: { command: "npm test", description: "Run tests" }
            }
          },
          { type: "tool", eventType: "tool.execution_complete", data: { toolCallId: "call-1", success: true } },
          { type: "assistant_event", eventType: "assistant.turn_end", data: { turnId: 1 } }
        ]}
      />
    );

    const label = screen.getByText("请求工具");
    expect(label).toBeInTheDocument();
    expect(label).not.toHaveClass("active");
    const cardShell = container.querySelector(".assistant-turn-card-shell");
    expect(cardShell).toHaveClass("collapsed");
    expect(cardShell).toHaveAttribute("aria-hidden", "true");

    const toggle = screen.getByRole("button", { name: "展开工具详情" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(cardShell).toHaveClass("expanded");
    expect(cardShell).toHaveAttribute("aria-hidden", "false");
    expect(container.querySelector(".glass-card-container")).toHaveStyle({ maxHeight: "200px" });
    expect(screen.getByText("Run tests")).toBeInTheDocument();
  });

  it("auto-collapses an expanded tool turn when it completes", () => {
    const runningEvents = [
      { type: "assistant_event", eventType: "assistant.turn_start", data: { turnId: 1 } },
      {
        type: "tool",
        eventType: "tool.execution_start",
        data: {
          toolCallId: "call-1",
          toolName: "bash",
          arguments: { command: "npm test", description: "Run tests" }
        }
      }
    ] as const;

    const { container, rerender } = render(
      <ContentRenderer
        content=""
        events={[...runningEvents]}
      />
    );

    expect(container.querySelector(".assistant-turn-card-shell")).toHaveClass("expanded");

    rerender(
      <ContentRenderer
        content=""
        events={[
          ...runningEvents,
          { type: "tool", eventType: "tool.execution_complete", data: { toolCallId: "call-1", success: true } },
          { type: "assistant_event", eventType: "assistant.turn_end", data: { turnId: 1 } }
        ]}
      />
    );

    expect(container.querySelector(".assistant-turn-card-shell")).toHaveClass("collapsed");
    expect(screen.getByRole("button", { name: "展开工具详情" })).toHaveAttribute("aria-expanded", "false");
  });

  it("renders tool call arguments as a code block when no command is present", async () => {
    const user = userEvent.setup();

    const { container } = render(
      <ContentRenderer
        content=""
        events={[
          { type: "assistant_event", eventType: "assistant.turn_start", data: { turnId: 1 } },
          {
            type: "tool",
            eventType: "tool.execution_start",
            data: {
              toolCallId: "call-1",
              toolName: "search",
              arguments: { query: "latest docs", limit: 3 }
            }
          },
          { type: "tool", eventType: "tool.execution_complete", data: { toolCallId: "call-1", success: true } },
          { type: "assistant_event", eventType: "assistant.turn_end", data: { turnId: 1 } }
        ]}
      />
    );

    await user.click(screen.getByRole("button", { name: "展开工具详情" }));

    const codeBlock = container.querySelector(".tool-execution-command code");
    expect(codeBlock).toHaveTextContent('"query": "latest docs"');
    expect(codeBlock).toHaveTextContent('"limit": 3');
  });

  it("does not render ask_user tool request content as message text", () => {
    render(
      <ContentRenderer
        content=""
        events={[
          { type: "assistant_event", eventType: "assistant.turn_start", data: { turnId: 1 } },
          {
            type: "assistant_event",
            eventType: "assistant.message",
            data: {
              toolRequests: [
                {
                  name: "ask_user",
                  arguments: { question: "请选择部署环境", description: "需要用户确认后继续" }
                }
              ]
            }
          },
          { type: "assistant_event", eventType: "assistant.turn_end", data: { turnId: 1 } }
        ]}
      />
    );

    expect(screen.getByText("询问用户")).not.toHaveClass("active");
    expect(screen.queryByText("请选择部署环境")).not.toBeInTheDocument();
    expect(screen.queryByText("需要用户确认后继续")).not.toBeInTheDocument();
  });

  it("does not render choice ask_user requests as a question and option card", () => {
    const { container } = render(
      <ContentRenderer
        content=""
        events={[
          { type: "assistant_event", eventType: "assistant.turn_start", data: { turnId: 1 } },
          {
            type: "assistant_event",
            eventType: "assistant.message",
            data: {
              toolRequests: [
                {
                  name: "ask_user",
                  arguments: {
                    type: "choice",
                    question: "请选择部署环境",
                    choices: ["staging", "production"]
                  }
                }
              ]
            }
          },
          { type: "assistant_event", eventType: "assistant.turn_end", data: { turnId: 1 } }
        ]}
      />
    );

    const card = container.querySelector(".choice-request-card");
    expect(card).toBeNull();
    expect(container.querySelector(".assistant-turn-card-shell")).toBeNull();
    expect(screen.getByText("询问用户")).not.toHaveClass("active");
    expect(screen.queryByText("请选择")).not.toBeInTheDocument();
    expect(screen.queryByText("请选择部署环境")).not.toBeInTheDocument();
    expect(screen.queryByText("staging")).not.toBeInTheDocument();
    expect(screen.queryByText("production")).not.toBeInTheDocument();
  });

  it("does not render freeform-only ask_user requests as input cards", () => {
    render(
      <ContentRenderer
        content=""
        events={[
          { type: "assistant_event", eventType: "assistant.turn_start", data: { turnId: 1 } },
          {
            type: "assistant_event",
            eventType: "assistant.message",
            data: {
              toolRequests: [
                {
                  name: "ask_user",
                  arguments: {
                    question: "Please provide your desired commit message. You can edit the draft or write a new one.",
                    allow_freeform: true
                  }
                }
              ]
            }
          }
        ]}
      />
    );

    expect(screen.getByText("正在询问用户")).toHaveClass("active");
    expect(screen.queryByText("请输入")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "请输入" })).not.toBeInTheDocument();
  });

  it("does not add a freeform input below input_request choices in message history", () => {
    const onChoiceSelect = vi.fn();

    render(
      <ContentRenderer
        content=""
        onChoiceSelect={onChoiceSelect}
        events={[
          { type: "assistant_event", eventType: "assistant.turn_start", data: { turnId: 1 } },
          {
            type: "input_request",
            eventType: "input_request",
            data: {
              requestId: "request-1",
              question: "Pick or write one",
              choices: ["staging", "production"],
              allowFreeform: true
            }
          }
        ]}
      />
    );

    expect(screen.getByText("正在询问用户")).toHaveClass("active");
    expect(screen.queryByText("请选择")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "production" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "自定义输入" })).not.toBeInTheDocument();
    expect(onChoiceSelect).not.toHaveBeenCalled();
  });

  it("does not render input_request choice cards in message history", () => {
    const onChoiceSelect = vi.fn();

    render(
      <ContentRenderer
        content=""
        onChoiceSelect={onChoiceSelect}
        events={[
          { type: "assistant_event", eventType: "assistant.turn_start", data: { turnId: 1 } },
          {
            type: "input_request",
            eventType: "input_request",
            data: {
              requestId: "request-1",
              question: "请选择部署环境",
              choices: ["staging", "production"]
            }
          }
        ]}
      />
    );

    expect(screen.getByText("正在询问用户")).toHaveClass("active");
    expect(screen.queryByText("请选择部署环境")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "production" })).not.toBeInTheDocument();
    expect(onChoiceSelect).not.toHaveBeenCalled();
  });

  it("renders ask_user tool calls in collapsed detail blocks that can expand", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ContentRenderer
        content=""
        events={[
          { type: "assistant_event", eventType: "assistant.turn_start", data: { turnId: 1 } },
          {
            type: "tool",
            eventType: "tool.execution_start",
            data: {
              toolCallId: "ask-1",
              toolName: "ask_user",
              arguments: { question: "请选择部署环境", choices: ["staging", "production"] }
            }
          },
          {
            type: "input_request",
            eventType: "input_request",
            data: {
              requestId: "request-1",
              question: "请选择部署环境",
              choices: ["staging", "production"]
            }
          }
        ]}
      />
    );

    expect(screen.getByText("正在询问用户")).toHaveClass("active");
    expect(container.querySelector(".assistant-turn-card-shell")).toHaveClass("collapsed");
    expect(container.querySelector(".choice-request-card")).toBeNull();
    expect(screen.queryByText("请选择部署环境")).not.toBeInTheDocument();

    const toggle = screen.getByRole("button", { name: "展开工具详情" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(container.querySelector(".assistant-turn-card-shell")).toHaveClass("expanded");
    expect(container.querySelector(".tool-execution-block")).not.toBeNull();
    expect(container.querySelector(".tool-execution-command code")).toHaveTextContent("请选择部署环境");
  });

  it("does not render freeform choice markers in message history", () => {
    render(
      <ContentRenderer
        content=""
        events={[
          { type: "assistant_event", eventType: "assistant.turn_start", data: { turnId: 1 } },
          {
            type: "assistant_event",
            eventType: "assistant.message",
            data: {
              toolRequests: [
                {
                  name: "ask_user",
                  arguments: {
                    question: "Pick or write",
                    choices: ["staging", { allow_freeform: true }]
                  }
                }
              ]
            }
          }
        ]}
      />
    );

    expect(screen.getByText("正在询问用户")).toHaveClass("active");
    expect(screen.queryByRole("button", { name: "staging" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "自定义输入" })).not.toBeInTheDocument();
  });

  it("does not render ask_user cards when the matching input request arrives", () => {
    const { container } = render(
      <ContentRenderer
        content=""
        events={[
          { type: "assistant_event", eventType: "assistant.turn_start", data: { turnId: 1 } },
          {
            type: "assistant_event",
            eventType: "assistant.message",
            data: {
              toolRequests: [
                {
                  name: "ask_user",
                  arguments: {
                    type: "choice",
                    question: "请选择部署环境",
                    choices: ["staging", "production"]
                  }
                }
              ]
            }
          },
          {
            type: "input_request",
            eventType: "input_request",
            data: {
              requestId: "request-1",
              question: "请选择部署环境",
              choices: ["staging", "production"]
            }
          },
          { type: "assistant_event", eventType: "assistant.turn_end", data: { turnId: 1 } }
        ]}
      />
    );

    expect(container.querySelectorAll(".choice-request-card")).toHaveLength(0);
    expect(screen.queryByText("请选择")).not.toBeInTheDocument();
    expect(screen.queryByText("请选择部署环境")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "production" })).not.toBeInTheDocument();
  });

  it("does not render synthetic ask_user cards even when freeform flags differ", () => {
    const onChoiceSelect = vi.fn();

    render(
      <ContentRenderer
        content=""
        onChoiceSelect={onChoiceSelect}
        events={[
          { type: "assistant_event", eventType: "assistant.turn_start", data: { turnId: 1 } },
          {
            type: "assistant_event",
            eventType: "assistant.message",
            data: {
              toolRequests: [
                {
                  name: "ask_user",
                  arguments: {
                    type: "choice",
                    question: "请选择部署环境",
                    choices: ["staging", "production"]
                  }
                }
              ]
            }
          },
          {
            type: "input_request",
            eventType: "input_request",
            data: {
              requestId: "request-1",
              question: "请选择部署环境",
              choices: ["staging", "production"],
              allowFreeform: true
            }
          }
        ]}
      />
    );

    expect(screen.queryByText("请选择部署环境")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "production" })).not.toBeInTheDocument();
    expect(screen.queryByText("请选择部署环境")).not.toBeInTheDocument();
    expect(onChoiceSelect).not.toHaveBeenCalled();
  });

  it("does not call back from input_request choices in message history", () => {
    const onChoiceSelect = vi.fn();

    render(
      <ContentRenderer
        content=""
        onChoiceSelect={onChoiceSelect}
        events={[
          { type: "assistant_event", eventType: "assistant.turn_start", data: { turnId: 1 } },
          {
            type: "input_request",
            eventType: "input_request",
            data: {
              requestId: "request-1",
              question: "请选择部署环境",
              choices: ["staging", "production"]
            }
          },
          { type: "assistant_event", eventType: "assistant.turn_end", data: { turnId: 1 } }
        ]}
      />
    );

    expect(screen.getByText("询问用户")).not.toHaveClass("active");
    expect(screen.queryByRole("button", { name: "production" })).not.toBeInTheDocument();
    expect(onChoiceSelect).not.toHaveBeenCalled();
  });

  it("hides a choice request card after the request is answered", () => {
    const { container } = render(
      <ContentRenderer
        content=""
        answeredInputRequestIds={new Set(["request-1"])}
        events={[
          { type: "assistant_event", eventType: "assistant.turn_start", data: { turnId: 1 } },
          {
            type: "input_request",
            eventType: "input_request",
            data: {
              requestId: "request-1",
              question: "请选择部署环境",
              choices: ["staging", "production"]
            }
          },
          { type: "assistant_event", eventType: "assistant.turn_end", data: { turnId: 1 } }
        ]}
      />
    );

    expect(container.querySelector(".choice-request-card")).toBeNull();
    expect(screen.queryByText("请选择")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "production" })).not.toBeInTheDocument();
  });

  it("merges adjacent completed turns that share the same inactive label", () => {
    const { container } = render(
      <ContentRenderer
        content=""
        events={[
          { type: "assistant_event", eventType: "assistant.turn_start", data: { turnId: 1 } },
          {
            type: "tool",
            eventType: "tool.execution_start",
            data: {
              toolCallId: "call-1",
              toolName: "bash",
              arguments: { command: "npm test", description: "Run tests" }
            }
          },
          { type: "tool", eventType: "tool.execution_complete", data: { toolCallId: "call-1", success: true } },
          { type: "assistant_event", eventType: "assistant.turn_end", data: { turnId: 1 } },
          { type: "assistant_event", eventType: "assistant.turn_start", data: { turnId: 2 } },
          {
            type: "tool",
            eventType: "tool.execution_start",
            data: {
              toolCallId: "call-2",
              toolName: "bash",
              arguments: { command: "npm run build", description: "Build app" }
            }
          },
          { type: "tool", eventType: "tool.execution_complete", data: { toolCallId: "call-2", success: true } },
          { type: "assistant_event", eventType: "assistant.turn_end", data: { turnId: 2 } }
        ]}
      />
    );

    expect(screen.getAllByText("请求工具")).toHaveLength(1);
    expect(container.querySelectorAll(".assistant-turn")).toHaveLength(1);
    expect(screen.getByText("Run tests")).toBeInTheDocument();
    expect(screen.getByText("Build app")).toBeInTheDocument();
  });

  it("renders skill tool calls inline as a pill instead of tool detail card", () => {
    const { container } = render(
      <ContentRenderer
        content=""
        events={[
          { type: "assistant_event", eventType: "assistant.turn_start", data: { turnId: 1 } },
          {
            type: "tool",
            eventType: "tool.execution_start",
            data: {
              toolCallId: "skill-1",
              toolName: "skill",
              arguments: { skill: "openai-docs", description: "查询官方文档" }
            }
          },
          { type: "tool", eventType: "tool.execution_complete", data: { toolCallId: "skill-1", success: true } },
          { type: "assistant_event", eventType: "assistant.message", data: { content: "查到了。" } },
          { type: "assistant_event", eventType: "assistant.turn_end", data: { turnId: 1 } }
        ]}
      />
    );

    expect(screen.getByText("Skill")).toHaveClass("skill-call-label");
    expect(screen.getByText("openai-docs")).toHaveClass("skill-call-name");
    expect(screen.queryByText("查询官方文档")).not.toBeInTheDocument();
    expect(screen.getByText("查到了。")).toBeInTheDocument();
    expect(container.querySelector(".skill-call-light")).not.toBeNull();
    expect(container.querySelector(".tool-execution-block")).toBeNull();
    expect(container.querySelector(".assistant-turn-card-shell")).toBeNull();
  });
});
