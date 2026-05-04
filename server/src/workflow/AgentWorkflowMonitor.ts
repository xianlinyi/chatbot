import type { AgentSkillWorkflow } from "../config/types.js";
import type { AgentStreamEvent } from "../providers/types.js";

export type WorkflowProgressMarker = {
  skill: string;
  step: string;
  status: "started" | "completed";
  success?: boolean;
};

type StepState = {
  started: boolean;
  completed: boolean;
  success?: boolean;
};

export type MissingWorkflowSteps = {
  skill: string;
  steps: Array<{
    id: string;
    goal: string;
  }>;
};

export class AgentWorkflowMonitor {
  private readonly activeSkills = new Set<string>();
  private readonly stepStates = new Map<string, StepState>();
  private readonly confirmedStepKeys = new Set<string>();

  constructor(private readonly workflows: AgentSkillWorkflow[]) {}

  observe(event: AgentStreamEvent): AgentStreamEvent[] {
    if (event.type !== "copilot_event") return [];

    const emitted: AgentStreamEvent[] = [];
    const skill = skillFromToolEvent(event);
    if (skill) {
      this.activeSkills.add(skill);
      emitted.push({ type: "assistant_event", eventType: "workflow.skill_selected", data: { skill } });
    }

    const content = stringValue(event.data.content) ?? stringValue(event.data.deltaContent);
    if (!content) return emitted;

    for (const marker of extractWorkflowMarkers(content)) {
      this.activeSkills.add(marker.skill);
      this.apply(marker);
      emitted.push({
        type: "assistant_event",
        eventType: marker.status === "completed" ? "workflow.step_completed" : "workflow.step_started",
        data: marker
      });
    }

    return emitted;
  }

  finishEvents(): AgentStreamEvent[] {
    const events: AgentStreamEvent[] = [];
    for (const report of this.missingReports({ includeComplete: true })) {
      events.push({
        type: "assistant_event",
        eventType: report.steps.length === 0 ? "workflow.completed" : "workflow.incomplete",
        data: {
          skill: report.skill,
          missingSteps: report.steps.map((step) => step.id)
        }
      });
    }
    return events;
  }

  confirmationEvents(): AgentStreamEvent[] {
    const events: AgentStreamEvent[] = [];
    for (const workflow of this.workflows) {
      if (!this.activeSkills.has(workflow.name)) continue;
      for (const step of workflow.steps) {
        const stepKey = key(workflow.name, step.id);
        if (this.confirmedStepKeys.has(stepKey)) continue;
        const state = this.stepStates.get(stepKey);
        if (!state?.completed) continue;
        this.confirmedStepKeys.add(stepKey);
        events.push({
          type: "assistant_event",
          eventType: "workflow.step_confirmed",
          data: {
            skill: workflow.name,
            step: step.id,
            success: state.success
          }
        });
      }
    }
    return events;
  }

  missingReports(options: { includeComplete?: boolean } = {}): MissingWorkflowSteps[] {
    return this.workflows
      .filter((workflow) => this.activeSkills.has(workflow.name))
      .map((workflow) => ({
        skill: workflow.name,
        steps: workflow.steps
          .filter((step) => step.required !== false)
          .filter((step) => !this.stepStates.get(key(workflow.name, step.id))?.completed)
          .map((step) => ({ id: step.id, goal: step.goal }))
      }))
      .filter((report) => options.includeComplete || report.steps.length > 0);
  }

  nextStepReports(): MissingWorkflowSteps[] {
    return this.workflows
      .filter((workflow) => this.activeSkills.has(workflow.name))
      .map((workflow) => {
        const next = workflow.steps
          .filter((step) => step.required !== false)
          .find((step) => !this.stepStates.get(key(workflow.name, step.id))?.completed);
        return {
          skill: workflow.name,
          steps: next ? [{ id: next.id, goal: next.goal }] : []
        };
      })
      .filter((report) => report.steps.length > 0);
  }

  repairPrompt(reports: MissingWorkflowSteps[]): string {
    const missing = reports
      .map((report) => {
        const steps = report.steps.map((step) => `- ${step.id}: ${step.goal}`).join("\n");
        return `Skill: ${report.skill}\nMissing required steps:\n${steps}`;
      })
      .join("\n\n");

    return [
      "Runtime workflow repair request.",
      "Continue the same user task using the already selected agent skill. Only rerun the missing required workflow steps listed below.",
      "Do not restart completed steps unless a missing step depends on a small piece of context from them.",
      "For every missing step, emit the required hidden workflow-step markers when the step starts and when it completes.",
      "After the missing steps are completed, provide only the incremental result or confirmation needed to finish the original answer.",
      "",
      missing
    ].join("\n");
  }

  nextStepPrompt(reports: MissingWorkflowSteps[]): string {
    const nextSteps = reports
      .map((report) => {
        const step = report.steps[0];
        return `Skill: ${report.skill}\nCurrent allowed step:\n- ${step.id}: ${step.goal}`;
      })
      .join("\n\n");

    return [
      "Runtime workflow state-machine confirmation.",
      "The previous workflow step has been confirmed by the runtime state machine.",
      "Continue the same user task using the already selected agent skill.",
      "Execute only the current allowed workflow step listed below, then stop and wait for another runtime continuation prompt.",
      "Emit the required hidden workflow-step markers when the step starts and when it completes.",
      "Do not execute later workflow steps and do not finalize the overall answer unless there are no later required steps.",
      "",
      nextSteps
    ].join("\n");
  }

  hasActiveWorkflow(): boolean {
    return this.workflows.some((workflow) => this.activeSkills.has(workflow.name));
  }


  private apply(marker: WorkflowProgressMarker): void {
    const state = this.stepStates.get(key(marker.skill, marker.step)) ?? { started: false, completed: false };
    if (marker.status === "started") state.started = true;
    if (marker.status === "completed") {
      state.started = true;
      state.completed = true;
      state.success = marker.success;
    }
    this.stepStates.set(key(marker.skill, marker.step), state);
  }
}

function extractWorkflowMarkers(content: string): WorkflowProgressMarker[] {
  const markers: WorkflowProgressMarker[] = [];
  const pattern = /<!--\s*workflow-step:\s*(\{[\s\S]*?\})\s*-->/g;
  for (const match of content.matchAll(pattern)) {
    try {
      const parsed = JSON.parse(match[1]) as Partial<WorkflowProgressMarker>;
      if (
        typeof parsed.skill === "string" &&
        typeof parsed.step === "string" &&
        (parsed.status === "started" || parsed.status === "completed")
      ) {
        markers.push({
          skill: parsed.skill,
          step: parsed.step,
          status: parsed.status,
          success: typeof parsed.success === "boolean" ? parsed.success : undefined
        });
      }
    } catch {
      // Ignore malformed progress comments from the model.
    }
  }
  return markers;
}

function skillFromToolEvent(event: Extract<AgentStreamEvent, { type: "copilot_event" }>): string | undefined {
  if (event.eventType !== "tool.execution_start" && event.eventType !== "tool.user_requested") return undefined;
  if (stringValue(event.data.toolName)?.toLowerCase() !== "skill") return undefined;

  const args = event.data.arguments;
  if (!args || typeof args !== "object") return undefined;
  const values = args as Record<string, unknown>;
  return stringValue(values.skill) ?? stringValue(values.skillName) ?? stringValue(values.skill_name);
}

function key(skill: string, step: string): string {
  return `${skill}\0${step}`;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
