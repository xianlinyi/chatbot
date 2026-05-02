import type { AgentStreamEvent } from "../providers/types.js";
import { ContextProvider } from "../context/ContextProvider.js";
import { CopilotSdkAdapter } from "../copilot/CopilotSdkAdapter.js";
import { StructuredJsonProvider } from "../copilot/StructuredJsonProvider.js";
import { EvidenceService } from "../evidence/EvidenceService.js";
import type { AgentProvider } from "../providers/types.js";
import { PiiMaskingService } from "../policy/PiiMaskingService.js";
import { ToolPolicyEngine } from "../policy/ToolPolicyEngine.js";
import { SkillSelector } from "../skills/SkillSelector.js";
import { ToolExecutor } from "../tools/ToolExecutor.js";
import type { DebugLogger } from "../utils/logger.js";
import { noopDebugLogger } from "../utils/logger.js";
import { WorkflowEngine } from "../workflow/WorkflowEngine.js";
import type { AgentTask, TaskState } from "../model/agentTypes.js";
import { ResponseGenerator } from "./ResponseGenerator.js";
import { TaskParser } from "./TaskParser.js";

export class AgentTaskService {
  private readonly copilot: CopilotSdkAdapter;
  private readonly parser: TaskParser;
  private readonly contextProvider: ContextProvider;
  private readonly skillSelector = new SkillSelector();
  private readonly evidence: EvidenceService;
  private readonly workflow: WorkflowEngine;
  private readonly responseGenerator: ResponseGenerator;

  constructor(
    provider: AgentProvider,
    workspaceRoot = process.cwd(),
    private readonly logger: DebugLogger = noopDebugLogger
  ) {
    const masking = new PiiMaskingService();
    this.copilot = new CopilotSdkAdapter(provider, masking);
    this.parser = new TaskParser(new StructuredJsonProvider(this.copilot, masking));
    this.contextProvider = new ContextProvider(workspaceRoot);
    this.evidence = new EvidenceService(withComponent(logger, "evidence"));
    const workflowLogger = withComponent(logger, "workflow");
    this.workflow = new WorkflowEngine(
      new ToolPolicyEngine(masking),
      new ToolExecutor(workspaceRoot, this.copilot, withComponent(logger, "tool-executor")),
      this.evidence,
      workflowLogger
    );
    this.responseGenerator = new ResponseGenerator(this.copilot);
  }

  async *runMessageStream(message: string): AsyncIterable<AgentStreamEvent> {
    this.logger.debug({ messageLength: message.length }, "Agent task request received");
    const now = new Date().toISOString();
    const taskSpec = await this.parser.parse(message);
    const task: AgentTask = {
      id: taskSpec.taskId,
      rawInput: message,
      taskSpec,
      state: "REQUEST_RECEIVED",
      selectedSkills: [],
      evidence: [],
      createdAt: now,
      updatedAt: now
    };
    this.logger.debug(
      {
        taskId: task.id,
        intent: taskSpec.intent,
        domain: taskSpec.domain,
        scenario: taskSpec.scenario,
        riskLevel: taskSpec.risk_level,
        recommendedSkills: taskSpec.recommended_skills,
        entityTypes: taskSpec.entities.map((entity) => entity.type),
        missingInfo: taskSpec.missing_info
      },
      "Agent task structured"
    );

    yield stateEvent(task, "REQUEST_RECEIVED");
    this.logState(task, "REQUEST_RECEIVED");
    task.state = "TASK_STRUCTURED";
    yield stateEvent(task, "TASK_STRUCTURED", { taskSpec });
    this.logState(task, "TASK_STRUCTURED");

    if (taskSpec.clarifying_question) {
      this.logger.debug(
        { taskId: task.id, clarifyingQuestion: taskSpec.clarifying_question },
        "Agent task needs clarification"
      );
      const answer = await this.responseGenerator.generate(task);
      yield { type: "delta", content: answer };
      yield { type: "done" };
      return;
    }

    task.state = "CONTEXT_LOADED";
    task.context = await this.contextProvider.load(taskSpec);
    yield stateEvent(task, "CONTEXT_LOADED", { context: task.context });
    this.logger.debug(
      {
        taskId: task.id,
        projectCount: task.context.projects.length,
        conceptCount: task.context.concepts.length,
        systemCount: task.context.systems.length
      },
      "Agent task context loaded"
    );
    this.logState(task, "CONTEXT_LOADED");

    task.selectedSkills = this.skillSelector.select(taskSpec, task.context);
    task.state = "SKILL_SELECTED";
    yield stateEvent(task, "SKILL_SELECTED", {
      skills: task.selectedSkills.map((skill) => skill.name)
    });
    this.logger.debug(
      {
        taskId: task.id,
        skills: task.selectedSkills.map((skill) => skill.name),
        stepCount: task.selectedSkills.reduce((count, skill) => count + skill.steps.length, 0)
      },
      "Agent task skills selected"
    );
    this.logState(task, "SKILL_SELECTED");

    let currentState: TaskState = task.state;
    for await (const event of this.workflow.run(task, task.context)) {
      task.updatedAt = new Date().toISOString();
      if (event.type === "state") {
        currentState = event.state;
        yield stateEvent(task, event.state);
        this.logState(task, event.state);
      } else if (event.type === "tool") {
        this.logger.debug(
          {
            taskId: task.id,
            stepId: event.step.id,
            tool: event.step.tool,
            skillName: event.step.skillName,
            success: event.result.success,
            summary: event.result.summary
          },
          "Agent task tool step completed"
        );
        yield {
          type: "tool",
          eventType: event.step.tool,
          data: {
            stepId: event.step.id,
            skillName: event.step.skillName,
            summary: event.result.summary,
            success: event.result.success
          }
        };
      } else if (event.type === "waiting_approval") {
        currentState = "WAITING_APPROVAL";
        this.logger.debug(
          {
            taskId: task.id,
            stepId: event.step.id,
            tool: event.step.tool,
            reason: event.reason
          },
          "Agent task waiting for approval"
        );
        yield {
          type: "assistant_event",
          eventType: "runtime.waiting_approval",
          data: {
            stepId: event.step.id,
            tool: event.step.tool,
            reason: event.reason
          }
        };
      } else {
        currentState = "FAILED";
        this.logger.debug(
          {
            taskId: task.id,
            stepId: event.step.id,
            tool: event.step.tool,
            error: event.error
          },
          "Agent task failed"
        );
        yield {
          type: "error",
          message: `${event.step.id}: ${event.error}`
        };
      }
    }
    task.state = currentState;

    if (currentState !== "FAILED" && currentState !== "WAITING_APPROVAL") {
      task.state = "ANSWER_READY";
      currentState = task.state;
      yield stateEvent(task, "ANSWER_READY");
      this.logState(task, "ANSWER_READY");
    }

    this.logger.debug({ taskId: task.id, evidenceCount: task.evidence.length }, "Agent task generating response");
    const answer = await this.responseGenerator.generate(task);
    yield { type: "delta", content: answer };
    this.logger.debug({ taskId: task.id, answerLength: answer.length }, "Agent task response generated");

    if (currentState !== "FAILED" && currentState !== "WAITING_APPROVAL") {
      task.state = "DONE";
      yield stateEvent(task, "DONE");
      this.logState(task, "DONE");
    }

    yield { type: "done" };
  }

  private logState(task: AgentTask, state: TaskState): void {
    this.logger.debug({ taskId: task.id, state, evidenceCount: task.evidence.length }, "Agent task state changed");
  }
}

function stateEvent(task: AgentTask, state: TaskState, data: Record<string, unknown> = {}): AgentStreamEvent {
  task.state = state;
  task.updatedAt = new Date().toISOString();
  return {
    type: "assistant_event",
    eventType: "runtime.state",
    data: {
      taskId: task.id,
      state,
      ...data
    }
  };
}

function withComponent(logger: DebugLogger, component: string): DebugLogger {
  return {
    debug: (details, message) => logger.debug({ ...details, component }, message)
  };
}
