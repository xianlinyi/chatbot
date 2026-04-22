const fs = require('fs');

let content = fs.readFileSync('client/src/App.tsx', 'utf-8');

const oldComponent = `function AssistantToolActivity({ activities }: { activities: ActivityItem[] }) {
  if (!activities.length) {
    return null;
  }

  return (
    <section className="tool-activity" aria-label="Agent activity">
      {activities.map((activity) =>
        activity.category === "skill" && activity.skills?.length ? (
          <SkillActivityCard key={activity.id} activity={activity} />
        ) : (
          <div className={\`tool-event \${activity.level ?? "info"}\`} key={activity.id}>
            <div className="tool-event-title">
              <span>{activity.title}</span>
            </div>
            {activity.detail ? <pre><code>{activity.detail}</code></pre> : null}
          </div>
        )
      )}
    </section>
  );
}`;

const newComponent = `function AssistantToolActivity({ activities }: { activities: ActivityItem[] }) {
  const skills = activities.filter(activity => activity.category === "skill" && activity.skills?.length);

  if (!skills.length) {
    return null;
  }

  return (
    <section className="tool-activity" aria-label="Agent activity">
      {skills.map((activity) => (
        <SkillActivityCard key={activity.id} activity={activity} />
      ))}
    </section>
  );
}`;

content = content.replace(oldComponent, newComponent);

fs.writeFileSync('client/src/App.tsx', content);
