import React, { useState, useEffect } from "react";
import type { ActivityItem, SkillSummary } from "../types.js";

export function SkillPill({ skill }: { skill: SkillSummary }) {
  const details = [
    skill.description,
    skill.source,
    skill.pluginName ? `${skill.pluginName}${skill.pluginVersion ? ` ${skill.pluginVersion}` : ""}` : undefined,
    skill.enabled === false ? "Disabled" : undefined,
    skill.userInvocable ? "User invocable" : undefined,
    skill.allowedTools?.length ? `Allowed tools: ${skill.allowedTools.join(", ")}` : undefined,
    skill.path
  ].filter((item): item is string => Boolean(item));

  return (
    <span className="skill-pill black-white-skill" aria-label={`Skill ${skill.name}`} title={details.join("\n") || skill.name}>
      <span className="skill-pill-label">Skill</span>
      <span className="skill-pill-name">{skill.name}</span>
    </span>
  );
}

export function SkillActivityCard({ activity }: { activity: ActivityItem }) {
  const [showAnimation, setShowAnimation] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowAnimation(false);
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="skill-activity-group">
      <div className="skill-pill-list black-white-pill-list">
        {showAnimation && (
          <span className="breathing-light green-light" aria-hidden="true" />
        )}
        {activity.skills?.map((skill) => (
          <SkillPill key={`${activity.id}-${skill.name}-${skill.path ?? ""}`} skill={skill} />
        ))}
      </div>
    </div>
  );
}
