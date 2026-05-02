import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { CopilotSdkAdapter } from "../copilot/CopilotSdkAdapter.js";
import type { SkillExecutionContext, ToolResult, WorkflowStep } from "../model/agentTypes.js";
import type { DebugLogger } from "../utils/logger.js";
import { noopDebugLogger } from "../utils/logger.js";

const execFileAsync = promisify(execFile);

export class ToolExecutor {
  constructor(
    private readonly workspaceRoot = process.cwd(),
    private readonly copilot?: CopilotSdkAdapter,
    private readonly logger: DebugLogger = noopDebugLogger
  ) {}

  async execute(step: WorkflowStep, context: SkillExecutionContext): Promise<ToolResult> {
    const startedAt = Date.now();
    this.logger.debug(
      { taskId: context.task.id, stepId: step.id, tool: step.tool, skillName: step.skillName },
      "Tool execution started"
    );

    const result = await this.executeInternal(step, context);
    this.logger.debug(
      {
        taskId: context.task.id,
        stepId: step.id,
        tool: step.tool,
        success: result.success,
        summary: result.summary,
        durationMs: Date.now() - startedAt
      },
      "Tool execution completed"
    );
    return result;
  }

  private async executeInternal(step: WorkflowStep, context: SkillExecutionContext): Promise<ToolResult> {
    switch (step.tool) {
      case "project.resolve":
        return this.resolveProject(context);
      case "code.search":
        return this.searchCode(context);
      case "file.read":
        return this.readCandidateFiles(context);
      case "git.status":
        return this.git(["status", "--short"], "Git status collected.");
      case "git.diff":
        return this.git(["diff", "--stat"], "Git diff summary collected.");
      case "db.query":
        return this.mockDbQuery(step, context);
      case "log.search":
        return this.mockLogSearch(step, context);
      case "copilot.reason":
        return this.reason(step, context);
      case "copilot.patch":
        return {
          success: true,
          summary: "Patch generation is available only after explicit approval in this MVP.",
          raw: { skipped: true, requiresApproval: true }
        };
      case "user.confirm":
      case "git.commit":
        return {
          success: false,
          summary: `${step.tool} requires explicit user confirmation and was not executed.`,
          raw: { blocked: true, requiresApproval: true }
        };
      default:
        return { success: false, summary: `Unsupported tool "${step.tool}".`, error: "unsupported_tool" };
    }
  }

  private resolveProject(context: SkillExecutionContext): ToolResult {
    const projectEntity = context.task.taskSpec.entities.find((entity) => entity.type === "project");
    const project =
      context.context.projects.find((candidate) => candidate.name === projectEntity?.canonical_name) ??
      context.context.projects[0];

    if (!project) {
      return { success: false, summary: "No project context is configured.", error: "project_not_found" };
    }

    return {
      success: true,
      summary: `Resolved project ${project.name} at ${project.path}.`,
      raw: project
    };
  }

  private async searchCode(context: SkillExecutionContext): Promise<ToolResult> {
    const query = buildCodeSearchQuery(context);
    if (!query) {
      return { success: false, summary: "No reliable keyword was available for code search.", error: "missing_query" };
    }

    try {
      const { stdout } = await execFileAsync("rg", ["--line-number", "--no-heading", "--fixed-strings", query, this.workspaceRoot], {
        timeout: 10_000,
        maxBuffer: 1024 * 1024
      });
      const lines = stdout.split("\n").filter(Boolean).slice(0, 20);
      return {
        success: true,
        summary: lines.length ? `Found ${lines.length} code matches for "${query}".` : `No code matches for "${query}".`,
        raw: { query, matches: lines }
      };
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException & { stdout?: string };
      if (nodeError.code === "ENOENT") {
        return { success: false, summary: "rg is not available for code search.", error: "rg_not_found" };
      }

      const lines = nodeError.stdout?.split("\n").filter(Boolean).slice(0, 20) ?? [];
      return {
        success: lines.length > 0,
        summary: lines.length ? `Found ${lines.length} code matches for "${query}".` : `No code matches for "${query}".`,
        raw: { query, matches: lines }
      };
    }
  }

  private async readCandidateFiles(context: SkillExecutionContext): Promise<ToolResult> {
    const files = new Set<string>();
    for (const evidence of context.evidence) {
      const raw = evidence.rawResult as { matches?: string[] } | undefined;
      for (const match of raw?.matches ?? []) {
        const [file] = match.split(":");
        if (file && isInside(this.workspaceRoot, file)) {
          files.add(file);
        }
      }
    }

    const selected = [...files].slice(0, 5);
    if (selected.length === 0) {
      return { success: false, summary: "No candidate files were found to read.", error: "no_candidate_files" };
    }

    const contents = await Promise.all(
      selected.map(async (file) => ({
        file,
        content: (await readFile(file, "utf8")).slice(0, 12_000)
      }))
    );

    return {
      success: true,
      summary: `Read ${contents.length} candidate file(s).`,
      raw: { files: contents.map(({ file }) => file), contents }
    };
  }

  private async git(args: string[], summary: string): Promise<ToolResult> {
    try {
      const { stdout } = await execFileAsync("git", args, {
        cwd: this.workspaceRoot,
        timeout: 10_000,
        maxBuffer: 1024 * 1024
      });
      return { success: true, summary, raw: { command: ["git", ...args], output: stdout.trim() } };
    } catch (error) {
      return {
        success: false,
        summary: `git ${args.join(" ")} failed.`,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private mockDbQuery(step: WorkflowStep, context: SkillExecutionContext): ToolResult {
    const orderId = entityValue(context, "order_id") ?? "unknown";
    const mockByStep: Record<string, unknown> = {
      check_source_event: { source: "mock", table: "payment_order", orderId, status: "SUCCESS" },
      check_artifact_generated: { source: "mock", table: "payment_proof", orderId, status: "GENERATED", proofId: "proof_mock_001" },
      check_notification_created: {
        source: "mock",
        table: "notification_record",
        orderId,
        recordFound: false,
        reason: "recipient_email missing"
      }
    };
    const raw = mockByStep[step.id] ?? { source: "mock", orderId, note: "No mock dataset for this DB step." };
    return {
      success: true,
      summary: `Mock readonly db.query completed for ${step.id}.`,
      raw
    };
  }

  private mockLogSearch(step: WorkflowStep, context: SkillExecutionContext): ToolResult {
    const orderId = entityValue(context, "order_id") ?? "unknown";
    const raw =
      step.id === "check_event_published"
        ? { source: "mock", service: "proof-service", orderId, event: "payment.proof.created", published: true }
        : {
            source: "mock",
            service: "notification-service",
            orderId,
            deliveryStatus: "NOT_CREATED",
            message: "recipient_email missing"
          };

    return {
      success: true,
      summary: `Mock log.search completed for ${step.id}.`,
      raw
    };
  }

  private async reason(step: WorkflowStep, context: SkillExecutionContext): Promise<ToolResult> {
    const fallback = summarizeEvidence(step, context);
    if (!this.copilot) {
      return { success: true, summary: fallback, raw: { generatedBy: "runtime-fallback" } };
    }

    try {
      const answer = await this.copilot.ask(createReasonPrompt(step, context));
      return {
        success: true,
        summary: answer || fallback,
        raw: { generatedBy: answer ? "copilot" : "runtime-fallback" }
      };
    } catch {
      return { success: true, summary: fallback, raw: { generatedBy: "runtime-fallback" } };
    }
  }
}

function buildCodeSearchQuery(context: SkillExecutionContext): string | undefined {
  const error = entityValue(context, "error_message");
  if (error) {
    return error;
  }

  const input = context.task.rawInput;
  for (const token of ["content", "undefined", "sendMessage", "message", "chatbot"]) {
    if (input.toLowerCase().includes(token.toLowerCase())) {
      return token;
    }
  }

  return undefined;
}

function entityValue(context: SkillExecutionContext, type: string): string | undefined {
  const entity = context.task.taskSpec.entities.find((candidate) => candidate.type === type);
  return entity?.value ?? entity?.canonical_name ?? entity?.name ?? undefined;
}

function isInside(root: string, file: string): boolean {
  const relative = path.relative(root, file);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function summarizeEvidence(step: WorkflowStep, context: SkillExecutionContext): string {
  if (context.evidence.length === 0) {
    return `${step.goal}: evidence is not available yet.`;
  }

  return context.evidence.map((item) => `${item.stepId}: ${item.resultSummary}`).join("\n");
}

function createReasonPrompt(step: WorkflowStep, context: SkillExecutionContext): string {
  return `你是企业任务处理 Agent 的推理步骤。
只基于 Evidence 回答，不要编造没有证据的信息。

当前步骤：${step.id} - ${step.goal}
TaskSpec:
${JSON.stringify(context.task.taskSpec, null, 2)}

Context:
${JSON.stringify(context.context, null, 2)}

Evidence:
${JSON.stringify(context.evidence, null, 2)}

请输出简洁结论。`;
}
