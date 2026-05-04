import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { AgentSkillWorkflow, AgentSkillWorkflowStep } from "../config/types.js";

export async function loadAgentSkillWorkflows(skillDirectories: string[]): Promise<AgentSkillWorkflow[]> {
  const markdownFiles = (
    await Promise.all(skillDirectories.filter((directory) => existsSync(directory)).map((directory) => findMarkdownFiles(directory)))
  ).flat();
  const workflows = await Promise.all(markdownFiles.map((file) => loadWorkflow(file)));
  return workflows.filter((workflow): workflow is AgentSkillWorkflow => Boolean(workflow));
}

export function workflowInstruction(workflows: AgentSkillWorkflow[]): string {
  if (workflows.length === 0) return "";

  const workflowText = workflows
    .map((workflow) => {
      const steps = workflow.steps
        .map((step) => `- ${step.id}: ${step.goal}${step.required === false ? " (optional)" : ""}`)
        .join("\n");
      return `Skill: ${workflow.name}\n${steps}`;
    })
    .join("\n\n");

  return [
    "When using an agent skill with a workflow below, follow its steps in strict order under runtime state-machine gating.",
    "Use exactly this HTML comment format when a step starts or completes:",
    '<!-- workflow-step: {"skill":"skill-name","step":"step-id","status":"started"} -->',
    '<!-- workflow-step: {"skill":"skill-name","step":"step-id","status":"completed","success":true} -->',
    "Do not show these markers as visible prose.",
    "Execute only the currently allowed workflow step, then stop and wait for a runtime continuation prompt before executing the next workflow step.",
    "Do not skip ahead, do not finalize the overall answer, and do not execute later workflow steps until the runtime explicitly opens the next step.",
    "",
    workflowText
  ].join("\n");
}

async function loadWorkflow(file: string): Promise<AgentSkillWorkflow | undefined> {
  const markdown = await readFile(file, "utf8");
  const name = firstHeading(markdown) ?? path.basename(path.dirname(file));
  const section = readSection(markdown, "workflow") ?? readSection(markdown, "steps");
  if (!section) return undefined;

  const steps = parseSteps(section);
  if (steps.length === 0) return undefined;
  return { name, sourcePath: file, steps };
}

async function findMarkdownFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return findMarkdownFiles(entryPath);
      if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) return [entryPath];
      return [];
    })
  );
  return nested.flat();
}

function parseSteps(section: string): AgentSkillWorkflowStep[] {
  return section
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("-"))
    .map((line) => parseStep(line.slice(1).trim()))
    .filter((step): step is AgentSkillWorkflowStep => Boolean(step));
}

function parseStep(line: string): AgentSkillWorkflowStep | undefined {
  const normalized = line.replace(/^\[[ xX]\]\s*/, "");
  if (normalized.includes("|")) {
    const [id, goal, required] = normalized.split("|").map((part) => part.trim());
    if (!id || !goal) return undefined;
    return { id, goal, required: required === undefined ? undefined : required.toLowerCase() !== "false" };
  }

  const match = /^`?([\w.-]+)`?\s*:\s*(.+)$/.exec(normalized);
  if (match) return { id: match[1], goal: match[2] };

  const goal = normalized.trim();
  if (!goal) return undefined;
  return { id: slugify(goal), goal };
}

function readSection(markdown: string, sectionName: string): string | undefined {
  const escaped = sectionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(?:^|\\r?\\n)##\\s+${escaped}\\s*\\r?\\n([\\s\\S]*?)(?=\\r?\\n##\\s+|$)`, "i");
  return pattern.exec(markdown)?.[1]?.trim();
}

function firstHeading(markdown: string): string | undefined {
  return /^#\s+(.+?)\s*$/m.exec(markdown)?.[1]?.trim();
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/`/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}
