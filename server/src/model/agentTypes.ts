export type TaskIntent =
  | "diagnose_business_issue"
  | "fix_or_investigate_bug"
  | "git_commit"
  | "code_search"
  | "explain_code"
  | "create_report"
  | "unknown";

export type TaskRiskLevel =
  | "readonly"
  | "write_requires_confirmation"
  | "code_write_requires_review"
  | "dangerous_requires_manual";

export type EntityRef = {
  type: string;
  name?: string | null;
  value?: string | null;
  canonical_name?: string | null;
  confidence: number;
  source?: "user_input" | "context" | "system" | "llm";
};

export type TaskSpec = {
  taskId: string;
  rawInput: string;
  intent: TaskIntent;
  domain: string | null;
  scenario: string | null;
  entities: EntityRef[];
  missing_info: string[];
  risk_level: TaskRiskLevel;
  recommended_skills: string[];
  clarifying_question: string | null;
};

export type TaskState =
  | "REQUEST_RECEIVED"
  | "TASK_STRUCTURED"
  | "ENTITY_RESOLVED"
  | "CONTEXT_LOADED"
  | "SKILL_SELECTED"
  | "PLAN_CREATED"
  | "EVIDENCE_COLLECTING"
  | "DIAGNOSIS_READY"
  | "ACTION_PROPOSED"
  | "WAITING_APPROVAL"
  | "ACTION_EXECUTED"
  | "ANSWER_READY"
  | "DONE"
  | "FAILED";

export type Evidence = {
  id: string;
  taskId: string;
  stepId: string;
  tool?: string;
  inputSummary: string;
  resultSummary: string;
  rawResult?: unknown;
  confidence?: number;
  createdAt: string;
};

export type SkillType = "diagnosis" | "code" | "git" | "report" | "generic";

export type SkillStep = {
  id: string;
  goal: string;
  tool: string;
  required?: boolean;
};

export type SkillDefinition = {
  name: string;
  type: SkillType;
  description: string;
  triggers?: {
    intents?: TaskIntent[];
    domains?: string[];
    scenarios?: string[];
    keywords?: string[];
  };
  required_entities?: {
    any_of?: string[];
    all_of?: string[];
  };
  steps: SkillStep[];
  guards?: string[];
};

export type ContextBundle = {
  projects: ProjectContext[];
  concepts: BusinessConcept[];
  systems: SystemContext[];
  memory: Record<string, unknown>;
};

export type ProjectContext = {
  name: string;
  aliases: string[];
  path: string;
  repo: boolean;
  framework: string;
  packageManager: string;
  commands: Record<string, string>;
  structure: Record<string, string>;
  policies: string[];
};

export type BusinessConcept = {
  name: string;
  aliases: string[];
  domain: string;
  type: string;
  metadata: Record<string, unknown>;
};

export type SystemContext = {
  name: string;
  domain: string;
  owns?: string[];
  logs?: string[];
  publishes?: string[];
  consumes?: string[];
};

export type AgentTask = {
  id: string;
  rawInput: string;
  taskSpec: TaskSpec;
  state: TaskState;
  context?: ContextBundle;
  selectedSkills: SkillDefinition[];
  evidence: Evidence[];
  createdAt: string;
  updatedAt: string;
};

export type WorkflowStep = SkillStep & {
  skillName: string;
  order: number;
};

export type Workflow = {
  taskId: string;
  steps: WorkflowStep[];
};

export type SkillExecutionContext = {
  task: AgentTask;
  context: ContextBundle;
  evidence: Evidence[];
};

export type ToolRiskLevel = "readonly" | "write" | "dangerous";

export type ToolDefinition = {
  name: string;
  riskLevel: ToolRiskLevel;
  requiresApproval: boolean;
};

export type ToolResult = {
  success: boolean;
  summary: string;
  raw?: unknown;
  error?: string;
};

export type AgentResult = {
  task: AgentTask;
  answer: string;
};
