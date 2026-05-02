import { describe, expect, it } from "vitest";
import { TaskParser } from "../src/agent/TaskParser.js";
import { ContextProvider } from "../src/context/ContextProvider.js";
import { ToolPolicyEngine } from "../src/policy/ToolPolicyEngine.js";
import { SkillSelector } from "../src/skills/SkillSelector.js";

describe("agent runtime MVP", () => {
  it("structures payment proof diagnosis requests", async () => {
    const spec = await new TaskParser().parse("帮我查查 payment proof 为什么没有发过来，orderId=123456");

    expect(spec.intent).toBe("diagnose_business_issue");
    expect(spec.domain).toBe("payment");
    expect(spec.scenario).toBe("artifact_delivery_missing");
    expect(spec.risk_level).toBe("readonly");
    expect(spec.recommended_skills).toContain("artifact-delivery-diagnosis");
    expect(spec.entities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "order_id", value: "123456" }),
        expect.objectContaining({ type: "business_concept", canonical_name: "payment_proof" })
      ])
    );
  });

  it("selects the expected skills for accepted MVP examples", async () => {
    const parser = new TaskParser();
    const contextProvider = new ContextProvider();
    const selector = new SkillSelector();

    const payment = await parser.parse("帮我查查 payment proof 为什么没有发过来，orderId=123456");
    expect(selector.select(payment, await contextProvider.load(payment)).map((skill) => skill.name)).toContain(
      "artifact-delivery-diagnosis"
    );

    const bug = await parser.parse(
      "chatbot 项目，聊天页点击发送后报 Cannot read property 'content' of undefined，期望是正常发送消息。"
    );
    expect(selector.select(bug, await contextProvider.load(bug)).map((skill) => skill.name)).toContain(
      "code-bug-localization"
    );

    const commit = await parser.parse("帮我 commit 一下 chatbot 项目");
    expect(selector.select(commit, await contextProvider.load(commit)).map((skill) => skill.name)).toContain(
      "git-commit-workflow"
    );
  });

  it("enforces readonly/write/dangerous tool policy boundaries", () => {
    const policy = new ToolPolicyEngine();

    expect(policy.evaluate("db.query")).toMatchObject({ allowed: true, requiresApproval: false });
    expect(policy.evaluate("git.commit")).toMatchObject({ allowed: true, requiresApproval: true });
    expect(policy.evaluate("git.push")).toMatchObject({ allowed: false, requiresApproval: true });
    expect(policy.evaluate("db.update")).toMatchObject({ allowed: false, requiresApproval: true });
  });
});
