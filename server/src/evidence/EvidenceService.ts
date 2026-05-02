import { nanoid } from "nanoid";
import type { Evidence, ToolResult, WorkflowStep } from "../model/agentTypes.js";
import type { DebugLogger } from "../utils/logger.js";
import { noopDebugLogger } from "../utils/logger.js";

export class EvidenceService {
  private readonly evidenceByTask = new Map<string, Evidence[]>();

  constructor(private readonly logger: DebugLogger = noopDebugLogger) {}

  add(taskId: string, step: WorkflowStep, inputSummary: string, result: ToolResult): Evidence {
    const evidence: Evidence = {
      id: nanoid(),
      taskId,
      stepId: step.id,
      tool: step.tool,
      inputSummary,
      resultSummary: result.summary,
      rawResult: result.raw,
      confidence: result.success ? 0.8 : 0.2,
      createdAt: new Date().toISOString()
    };

    const list = this.evidenceByTask.get(taskId) ?? [];
    list.push(evidence);
    this.evidenceByTask.set(taskId, list);
    this.logger.debug(
      {
        taskId,
        evidenceId: evidence.id,
        stepId: step.id,
        tool: step.tool,
        success: result.success,
        confidence: evidence.confidence,
        evidenceCount: list.length
      },
      "Evidence saved"
    );
    return evidence;
  }

  list(taskId: string): Evidence[] {
    return [...(this.evidenceByTask.get(taskId) ?? [])];
  }
}
