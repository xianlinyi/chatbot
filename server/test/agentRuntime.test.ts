import { describe, expect, it } from "vitest";
import { TaskParser } from "../src/agent/TaskParser.js";
import { ContextProvider } from "../src/context/ContextProvider.js";
import { ToolPolicyEngine } from "../src/policy/ToolPolicyEngine.js";
import { SkillRegistry } from "../src/skills/SkillRegistry.js";
import { SkillSelector } from "../src/skills/SkillSelector.js";

describe("agent runtime MVP", () => {
  it("does not classify requests with built-in parser rules", async () => {
    const spec = await new TaskParser().parse("帮我查查 payment proof 为什么没有发过来，orderId=123456");

    expect(spec.intent).toBe("unknown");
    expect(spec.domain).toBeNull();
    expect(spec.scenario).toBeNull();
    expect(spec.risk_level).toBe("readonly");
    expect(spec.recommended_skills).toEqual([]);
    expect(spec.entities).toEqual([]);
    expect(spec.context_terms).toEqual([]);
  });

  it("has no built-in skills by default", async () => {
    const parser = new TaskParser();
    const contextProvider = new ContextProvider();
    const selector = new SkillSelector();

    const payment = await parser.parse("帮我查查 payment proof 为什么没有发过来，orderId=123456");
    expect(new SkillRegistry().list()).toEqual([]);
    expect(selector.select(payment, await contextProvider.load(payment))).toEqual([]);
  });

  it("enforces readonly/write/dangerous tool policy boundaries", () => {
    const policy = new ToolPolicyEngine();

    expect(policy.evaluate("db.query")).toMatchObject({ allowed: true, requiresApproval: false });
    expect(policy.evaluate("git.commit")).toMatchObject({ allowed: true, requiresApproval: true });
    expect(policy.evaluate("git.push")).toMatchObject({ allowed: false, requiresApproval: true });
    expect(policy.evaluate("db.update")).toMatchObject({ allowed: false, requiresApproval: true });
  });
});
