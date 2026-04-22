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
              {activity.status === "running" ? (
                <span className="thinking-dots tool-event-dots" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
              ) : null}
            </div>
            {activity.detail ? <pre><code>{activity.detail}</code></pre> : null}
          </div>
        )
      )}
    </section>
  );
}`;

const newComponent = `function AssistantToolActivity({ activities }: { activities: ActivityItem[] }) {
  if (!activities.length) {
    return null;
  }

  const hasRunning = activities.some(a => a.status === "running");

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
      {hasRunning && (
        <div className="tool-event info" style={{ paddingBottom: '4px' }}>
          <div className="tool-event-title">
            <span className="thinking-dots tool-event-dots" style={{ marginLeft: 0 }} aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </div>
        </div>
      )}
    </section>
  );
}`;

content = content.replace(oldComponent, newComponent);

fs.writeFileSync('client/src/App.tsx', content);
