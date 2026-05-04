import { describe, expect, it } from "vitest";
import { AgentWorkflowMonitor } from "../src/workflow/AgentWorkflowMonitor.js";

describe("AgentWorkflowMonitor", () => {
  it("tracks workflow markers and reports completion", () => {
    const monitor = new AgentWorkflowMonitor([
      {
        name: "diagnose-payment",
        sourcePath: "/skills/diagnose/SKILL.md",
        steps: [
          { id: "collect-evidence", goal: "Collect evidence", required: true },
          { id: "conclude", goal: "Explain conclusion", required: true }
        ]
      }
    ]);

    expect(
      monitor.observe({
        type: "copilot_event",
        eventType: "tool.execution_start",
        data: { toolName: "skill", arguments: { skill: "diagnose-payment" } }
      })
    ).toEqual([{ type: "assistant_event", eventType: "workflow.skill_selected", data: { skill: "diagnose-payment" } }]);

    monitor.observe({
      type: "copilot_event",
      eventType: "assistant.message",
      data: {
        content:
          '<!-- workflow-step: {"skill":"diagnose-payment","step":"collect-evidence","status":"completed","success":true} -->'
      }
    });

    expect(monitor.confirmationEvents()).toEqual([
      {
        type: "assistant_event",
        eventType: "workflow.step_confirmed",
        data: { skill: "diagnose-payment", step: "collect-evidence", success: true }
      }
    ]);
    expect(monitor.confirmationEvents()).toEqual([]);
    expect(monitor.nextStepReports()).toEqual([
      {
        skill: "diagnose-payment",
        steps: [{ id: "conclude", goal: "Explain conclusion" }]
      }
    ]);
    expect(monitor.nextStepPrompt(monitor.nextStepReports())).toContain("current allowed workflow step");

    expect(monitor.missingReports()).toEqual([
      {
        skill: "diagnose-payment",
        steps: [{ id: "conclude", goal: "Explain conclusion" }]
      }
    ]);
    expect(monitor.repairPrompt(monitor.missingReports())).toContain("Only rerun the missing required workflow steps");
    expect(monitor.repairPrompt(monitor.missingReports())).toContain("Skill: diagnose-payment");
    expect(monitor.repairPrompt(monitor.missingReports())).toContain("- conclude: Explain conclusion");

    expect(monitor.finishEvents()).toEqual([
      {
        type: "assistant_event",
        eventType: "workflow.incomplete",
        data: { skill: "diagnose-payment", missingSteps: ["conclude"] }
      }
    ]);

    monitor.observe({
      type: "copilot_event",
      eventType: "assistant.message",
      data: {
        content:
          '<!-- workflow-step: {"skill":"diagnose-payment","step":"conclude","status":"completed","success":true} -->'
      }
    });

    expect(monitor.finishEvents()).toEqual([
      {
        type: "assistant_event",
        eventType: "workflow.completed",
        data: { skill: "diagnose-payment", missingSteps: [] }
      }
    ]);
  });
});
