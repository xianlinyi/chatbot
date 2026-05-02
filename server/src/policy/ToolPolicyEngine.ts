import type { ToolDefinition, ToolResult } from "../model/agentTypes.js";
import { PiiMaskingService } from "./PiiMaskingService.js";

export type PolicyDecision =
  | { allowed: true; requiresApproval: boolean; reason?: string }
  | { allowed: false; requiresApproval: boolean; reason: string };

const toolDefinitions = new Map<string, ToolDefinition>([
  ["project.resolve", { name: "project.resolve", riskLevel: "readonly", requiresApproval: false }],
  ["code.search", { name: "code.search", riskLevel: "readonly", requiresApproval: false }],
  ["file.read", { name: "file.read", riskLevel: "readonly", requiresApproval: false }],
  ["git.status", { name: "git.status", riskLevel: "readonly", requiresApproval: false }],
  ["git.diff", { name: "git.diff", riskLevel: "readonly", requiresApproval: false }],
  ["db.query", { name: "db.query", riskLevel: "readonly", requiresApproval: false }],
  ["log.search", { name: "log.search", riskLevel: "readonly", requiresApproval: false }],
  ["copilot.reason", { name: "copilot.reason", riskLevel: "readonly", requiresApproval: false }],
  ["copilot.patch", { name: "copilot.patch", riskLevel: "write", requiresApproval: true }],
  ["user.confirm", { name: "user.confirm", riskLevel: "write", requiresApproval: true }],
  ["git.commit", { name: "git.commit", riskLevel: "write", requiresApproval: true }],
  ["git.push", { name: "git.push", riskLevel: "dangerous", requiresApproval: true }],
  ["db.update", { name: "db.update", riskLevel: "dangerous", requiresApproval: true }],
  ["deploy.production", { name: "deploy.production", riskLevel: "dangerous", requiresApproval: true }]
]);

export class ToolPolicyEngine {
  constructor(private readonly masking = new PiiMaskingService()) {}

  evaluate(toolName: string): PolicyDecision {
    const definition = toolDefinitions.get(toolName);
    if (!definition) {
      return { allowed: false, requiresApproval: false, reason: `Unknown tool "${toolName}".` };
    }

    if (definition.riskLevel === "dangerous") {
      return { allowed: false, requiresApproval: true, reason: `${toolName} is disabled by default.` };
    }

    if (definition.requiresApproval) {
      return { allowed: true, requiresApproval: true, reason: `${toolName} requires user approval.` };
    }

    return { allowed: true, requiresApproval: false };
  }

  sanitizeResult(result: ToolResult): ToolResult {
    return this.masking.maskUnknown(result);
  }
}
