import type { SkillDefinition } from "../model/agentTypes.js";

export class SkillRegistry {
  constructor(private readonly skills: SkillDefinition[] = []) {}

  list(): SkillDefinition[] {
    return [...this.skills];
  }

  get(name: string): SkillDefinition | undefined {
    return this.skills.find((skill) => skill.name === name);
  }
}
