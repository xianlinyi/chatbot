import type { CopilotSdkAdapter } from "../copilot/CopilotSdkAdapter.js";
import type { AgentTask } from "../model/agentTypes.js";

export class ResponseGenerator {
  constructor(private readonly copilot?: CopilotSdkAdapter) {}

  async generate(task: AgentTask): Promise<string> {
    const fallback = this.generateFallback(task);
    if (!this.copilot) {
      return fallback;
    }

    try {
      const answer = await this.copilot.ask(createPrompt(task));
      return answer || fallback;
    } catch {
      return fallback;
    }
  }

  private generateFallback(task: AgentTask): string {
    if (task.taskSpec.clarifying_question) {
      return task.taskSpec.clarifying_question;
    }

    if (task.evidence.length === 0) {
      return "证据不足，Runtime 没有收集到可用于判断的 Evidence。";
    }

    const evidenceLines = task.evidence.map((item, index) => `${index + 1}. ${item.stepId}: ${item.resultSummary}`);
    const needsHuman = task.state === "WAITING_APPROVAL" ? "是，需要人工确认后才能继续执行高风险动作。" : "否，当前阶段未执行写操作。";

    return [
      "1. 结论",
      task.state === "FAILED" ? "任务执行失败，原因见证据链。" : "已按 Runtime 工作流完成当前可执行步骤，结论仅基于已保存 Evidence。",
      "",
      "2. 证据链",
      ...evidenceLines,
      "",
      "3. 根因判断",
      task.evidence.at(-1)?.resultSummary ?? "证据不足，无法判断根因。",
      "",
      "4. 建议动作",
      task.state === "WAITING_APPROVAL" ? "请确认是否继续执行需要审批的动作。" : "如需进一步动作，请基于上述证据继续补充查询条件或确认写操作。",
      "",
      "5. 是否需要人工处理",
      needsHuman
    ].join("\n");
  }
}

function createPrompt(task: AgentTask): string {
  return `你是企业任务处理 Agent 的结果总结器。
请基于 TaskSpec、Context、Skill 和 Evidence 生成结论。
不要编造 Evidence 中没有的信息。如果证据不足，要明确说明还缺什么。

输出格式：
1. 结论
2. 证据链
3. 根因判断
4. 建议动作
5. 是否需要人工处理

TaskSpec:
${JSON.stringify(task.taskSpec, null, 2)}

Context:
${JSON.stringify(task.context, null, 2)}

Selected Skills:
${JSON.stringify(task.selectedSkills, null, 2)}

Evidence:
${JSON.stringify(task.evidence, null, 2)}

TaskState:
${task.state}`;
}
