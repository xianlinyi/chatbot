import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveAgentSkillDirectories } from "../src/skills/AgentSkillDirectories.js";
import { loadAgentSkillWorkflows } from "../src/skills/AgentSkillWorkflows.js";
import { testConfig } from "./helpers.js";

describe("resolveAgentSkillDirectories", () => {
  it("adds resource skill folders to provider skill directories", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "chatbot-agent-skill-test-"));
    try {
      await mkdir(path.join(cwd, "resource", "skills"), { recursive: true });
      const configured = path.join(cwd, "custom-skills");
      const config = {
        ...testConfig,
        provider: {
          ...testConfig.provider,
          skillDirectories: [configured]
        }
      };

      await expect(resolveAgentSkillDirectories(config, cwd)).resolves.toEqual([
        path.join(cwd, "resource", "skills"),
        configured
      ]);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("loads workflow steps from agent markdown skills", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "chatbot-agent-workflow-test-"));
    try {
      const skillsDir = path.join(cwd, "resource", "skills", "diagnose");
      await mkdir(skillsDir, { recursive: true });
      await writeFile(
        path.join(skillsDir, "SKILL.md"),
        `# diagnose-payment

Use this skill for payment diagnosis.

## Workflow
- collect-evidence | Collect evidence | true
- conclude | Explain the conclusion | true
`,
        "utf8"
      );

      await expect(loadAgentSkillWorkflows([path.join(cwd, "resource", "skills")])).resolves.toEqual([
        {
          name: "diagnose-payment",
          sourcePath: path.join(skillsDir, "SKILL.md"),
          steps: [
            { id: "collect-evidence", goal: "Collect evidence", required: true },
            { id: "conclude", goal: "Explain the conclusion", required: true }
          ]
        }
      ]);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
