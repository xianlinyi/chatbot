import type { AgentTask, ContextBundle, ToolResult, Workflow, WorkflowStep } from "../model/agentTypes.js";
import { EvidenceService } from "../evidence/EvidenceService.js";
import { ToolPolicyEngine } from "../policy/ToolPolicyEngine.js";
import { ToolExecutor } from "../tools/ToolExecutor.js";
import type { DebugLogger } from "../utils/logger.js";
import { noopDebugLogger } from "../utils/logger.js";

export type WorkflowEvent =
  | { type: "state"; state: AgentTask["state"] }
  | { type: "tool"; step: WorkflowStep; result: ToolResult }
  | { type: "waiting_approval"; step: WorkflowStep; reason: string }
  | { type: "failed"; step: WorkflowStep; error: string };

export class WorkflowEngine {
  constructor(
    private readonly policy: ToolPolicyEngine,
    private readonly executor: ToolExecutor,
    private readonly evidence: EvidenceService,
    private readonly logger: DebugLogger = noopDebugLogger
  ) {}

  createWorkflow(task: AgentTask): Workflow {
    const skills = task.selectedSkills.map((skill) => skill.name);
    const workflow = {
      taskId: task.id,
      steps: task.selectedSkills.flatMap((skill) =>
        skill.steps.map((step, index) => ({
          ...step,
          skillName: skill.name,
          order: index
        }))
      )
    };
    this.logger.debug({ taskId: task.id, skills, stepCount: workflow.steps.length }, "Workflow created");
    return workflow;
  }

  async *run(task: AgentTask, context: ContextBundle): AsyncIterable<WorkflowEvent> {
    this.logger.debug({ taskId: task.id }, "Workflow run started");
    task.state = "PLAN_CREATED";
    yield { type: "state", state: task.state };

    const workflow = this.createWorkflow(task);
    this.logger.debug(
      {
        taskId: task.id,
        stepCount: workflow.steps.length,
        steps: workflow.steps.map((step) => ({ id: step.id, tool: step.tool, skillName: step.skillName }))
      },
      "Workflow plan created"
    );
    task.state = "EVIDENCE_COLLECTING";
    yield { type: "state", state: task.state };

    for (const step of workflow.steps) {
      this.logger.debug(
        { taskId: task.id, stepId: step.id, tool: step.tool, skillName: step.skillName, required: step.required },
        "Workflow step started"
      );
      const decision = this.policy.evaluate(step.tool);
      this.logger.debug(
        {
          taskId: task.id,
          stepId: step.id,
          tool: step.tool,
          allowed: decision.allowed,
          requiresApproval: decision.requiresApproval,
          reason: decision.reason
        },
        "Workflow tool policy evaluated"
      );
      if (!decision.allowed) {
        const result = this.policy.sanitizeResult({
          success: false,
          summary: decision.reason,
          error: "blocked_by_policy"
        });
        const saved = this.evidence.add(task.id, step, step.goal, result);
        task.evidence.push(saved);
        this.logger.debug(
          { taskId: task.id, stepId: step.id, evidenceId: saved.id, summary: saved.resultSummary },
          "Workflow evidence saved"
        );
        task.state = "FAILED";
        yield { type: "failed", step, error: decision.reason };
        return;
      }

      if (decision.requiresApproval) {
        const result = this.policy.sanitizeResult({
          success: false,
          summary: decision.reason ?? `${step.tool} requires approval.`,
          raw: { requiresApproval: true }
        });
        const saved = this.evidence.add(task.id, step, step.goal, result);
        task.evidence.push(saved);
        this.logger.debug(
          { taskId: task.id, stepId: step.id, evidenceId: saved.id, summary: saved.resultSummary },
          "Workflow evidence saved"
        );

        if (step.required) {
          task.state = "WAITING_APPROVAL";
          yield { type: "waiting_approval", step, reason: result.summary };
          return;
        }

        yield { type: "tool", step, result };
        continue;
      }

      const result = this.policy.sanitizeResult(
        await this.executor.execute(step, {
          task,
          context,
          evidence: task.evidence
        })
      );
      const saved = this.evidence.add(task.id, step, step.goal, result);
      task.evidence.push(saved);
      this.logger.debug(
        {
          taskId: task.id,
          stepId: step.id,
          tool: step.tool,
          success: result.success,
          summary: result.summary,
          evidenceId: saved.id
        },
        "Workflow step result saved"
      );
      yield { type: "tool", step, result };

      if (!result.success && step.required) {
        task.state = "FAILED";
        yield { type: "failed", step, error: result.error ?? result.summary };
        return;
      }
    }

    task.state = "DIAGNOSIS_READY";
    this.logger.debug({ taskId: task.id, evidenceCount: task.evidence.length }, "Workflow run completed");
    yield { type: "state", state: task.state };
  }
}
