import type { ContextBundle, SkillDefinition, TaskSpec } from "../model/agentTypes.js";
import { SkillRegistry } from "./SkillRegistry.js";

export class SkillSelector {
  constructor(private readonly registry = new SkillRegistry()) {}

  select(taskSpec: TaskSpec, _context: ContextBundle): SkillDefinition[] {
    const rawInput = taskSpec.rawInput.toLowerCase();
    const matched = this.registry.list().filter((skill) => {
      if (taskSpec.recommended_skills.includes(skill.name)) {
        return true;
      }

      const triggers = skill.triggers;
      return Boolean(
        triggers?.intents?.includes(taskSpec.intent) ||
          (taskSpec.scenario && triggers?.scenarios?.includes(taskSpec.scenario)) ||
          (taskSpec.domain && triggers?.domains?.includes(taskSpec.domain)) ||
          triggers?.keywords?.some((keyword) => rawInput.includes(keyword.toLowerCase()))
      );
    });

    return matched.length ? sortBySpecificity(matched, taskSpec) : [];
  }
}

function sortBySpecificity(skills: SkillDefinition[], taskSpec: TaskSpec): SkillDefinition[] {
  return [...skills].sort((left, right) => score(right, taskSpec) - score(left, taskSpec));
}

function score(skill: SkillDefinition, taskSpec: TaskSpec): number {
  let value = 0;
  if (taskSpec.recommended_skills.includes(skill.name)) value += 100;
  if (taskSpec.scenario && skill.triggers?.scenarios?.includes(taskSpec.scenario)) value += 50;
  if (taskSpec.domain && skill.triggers?.domains?.includes(taskSpec.domain)) value += 25;
  if (skill.triggers?.intents?.includes(taskSpec.intent)) value += 10;
  return value;
}
