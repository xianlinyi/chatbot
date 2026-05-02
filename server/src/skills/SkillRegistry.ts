import type { SkillDefinition } from "../model/agentTypes.js";

const builtInSkills: SkillDefinition[] = [
  {
    name: "artifact-delivery-diagnosis",
    type: "diagnosis",
    description: "Diagnose why a generated artifact was not received by the expected recipient.",
    triggers: {
      intents: ["diagnose_business_issue"],
      scenarios: ["artifact_delivery_missing"],
      keywords: ["not received", "没收到", "没发过来", "没发送", "missing", "proof", "invoice", "email", "webhook"]
    },
    required_entities: {
      any_of: ["order_id", "payment_id", "user_id", "request_id", "trace_id"]
    },
    steps: [
      { id: "check_source_event", goal: "确认源事件是否已经发生", tool: "db.query", required: true },
      { id: "check_artifact_generated", goal: "确认目标产物是否已经生成", tool: "db.query", required: true },
      { id: "check_event_published", goal: "确认产物生成事件是否已经发布", tool: "log.search", required: true },
      { id: "check_notification_created", goal: "确认通知任务是否已经创建", tool: "db.query", required: true },
      { id: "check_delivery_status", goal: "确认实际投递状态", tool: "log.search", required: true },
      { id: "conclude", goal: "汇总证据并判断根因", tool: "copilot.reason", required: true }
    ],
    guards: ["readonly_only", "mask_pii", "no_resend_without_confirmation"]
  },
  {
    name: "code-bug-localization",
    type: "code",
    description: "Locate root cause for a bug report using project context and code search.",
    triggers: {
      intents: ["fix_or_investigate_bug"],
      keywords: ["error", "报错", "bug", "截图", "期望", "实际", "undefined", "null", "exception"]
    },
    required_entities: {
      any_of: ["project", "error_message", "page", "module"]
    },
    steps: [
      { id: "resolve_project", goal: "解析项目名称和项目目录", tool: "project.resolve", required: true },
      { id: "search_error_keyword", goal: "搜索错误关键字", tool: "code.search", required: true },
      { id: "search_related_module", goal: "根据页面、模块、操作步骤搜索相关代码", tool: "code.search", required: true },
      { id: "read_candidate_files", goal: "读取候选文件", tool: "file.read", required: true },
      { id: "identify_root_cause", goal: "根据代码和错误信息判断根因", tool: "copilot.reason", required: true },
      { id: "propose_patch", goal: "生成最小修改建议", tool: "copilot.patch", required: false }
    ],
    guards: ["do_not_modify_without_confirmation", "minimal_patch_only", "must_explain_root_cause"]
  },
  {
    name: "git-commit-workflow",
    type: "git",
    description: "Safely commit project changes.",
    triggers: {
      intents: ["git_commit"],
      keywords: ["commit", "提交", "git commit"]
    },
    required_entities: {
      all_of: ["project"]
    },
    steps: [
      { id: "resolve_project", goal: "解析项目目录", tool: "project.resolve", required: true },
      { id: "git_status", goal: "查看 Git 状态", tool: "git.status", required: true },
      { id: "git_diff", goal: "查看变更 diff", tool: "git.diff", required: true },
      { id: "summarize_changes", goal: "总结本次变更", tool: "copilot.reason", required: true },
      { id: "generate_commit_message", goal: "生成 commit message", tool: "copilot.reason", required: true },
      { id: "confirm_commit", goal: "请求用户确认是否提交", tool: "user.confirm", required: true },
      { id: "git_commit", goal: "执行 git commit", tool: "git.commit", required: true }
    ],
    guards: ["no_commit_without_diff", "no_commit_without_user_confirmation", "no_push_unless_requested"]
  },
  {
    name: "default-investigation",
    type: "generic",
    description: "Collect available context and produce an evidence-bound answer.",
    triggers: {
      intents: ["unknown", "code_search", "explain_code", "create_report"]
    },
    steps: [{ id: "reason_from_request", goal: "基于用户请求和上下文进行受控回答", tool: "copilot.reason", required: true }],
    guards: ["evidence_bound_answer"]
  }
];

export class SkillRegistry {
  constructor(private readonly skills: SkillDefinition[] = builtInSkills) {}

  list(): SkillDefinition[] {
    return [...this.skills];
  }

  get(name: string): SkillDefinition | undefined {
    return this.skills.find((skill) => skill.name === name);
  }
}
