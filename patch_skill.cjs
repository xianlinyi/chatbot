const fs = require('fs');
let content = fs.readFileSync('client/src/App.tsx', 'utf-8');

// 1. Extract SkillActivityCard
const skillComponent = `
function SkillActivityCard({ activity }: { activity: ActivityItem }) {
  // Use a ref to ensure the animation only plays once in this component's lifecycle
  const [showAnimation, setShowAnimation] = useState(true);

  // We could just let CSS handle a 1-time animation, or we can remove the class after it finishes
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowAnimation(false);
    }, 2000); // 假设呼吸灯播放2秒
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="skill-activity-group">
      <div className="tool-event-title">
        {showAnimation && (
          <span className="breathing-light" aria-hidden="true" />
        )}
        {activity.title}
      </div>
      <div className="skill-pill-list">
        {activity.skills?.map((skill) => (
          <SkillPill key={\`\${activity.id}-\${skill.name}-\${skill.path ?? ""}\`} skill={skill} />
        ))}
      </div>
    </div>
  );
}
`;

content = content.replace('function AssistantToolActivity', skillComponent + '\nfunction AssistantToolActivity');

const originalSkillRender = /activity\.category === "skill" && activity\.skills\?\.length \? \([\s\S]*?\) : \(/;
content = content.replace(originalSkillRender, `activity.category === "skill" && activity.skills?.length ? (
          <SkillActivityCard key={activity.id} activity={activity} />
        ) : (`);

// 2. Do not clear skill on done
content = content.replace(/message\.id === assistantId \? \{ \.\.\.message, status: "done", activities: \[\] \} : message/g, 
  `message.id === assistantId ? { ...message, status: "done", activities: message.activities?.filter(a => a.category === "skill") ?? [] } : message`);

fs.writeFileSync('client/src/App.tsx', content);
