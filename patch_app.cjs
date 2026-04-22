const fs = require('fs');
let content = fs.readFileSync('client/src/App.tsx', 'utf-8');

content = "import { SkillPill, SkillActivityCard } from './components/SkillActivityCard.js';\n" + content;

// Remove local SkillPill definition and SkillActivityCard definition
content = content.replace(/function SkillPill\(\{\sskill\s\}\:\s\{\sskill:\sSkillSummary\s\}\)\s\{[\s\S]*?\}\n\n\nfunction SkillActivityCard\(\{\sactivity\s\}\:\s\{\sactivity:\sActivityItem\s\}\)\s\{[\s\S]*?\}\n\n/g, '');

fs.writeFileSync('client/src/App.tsx', content);

let presenter = fs.readFileSync('client/src/agentEventPresenter.ts', 'utf-8');
presenter = presenter.replace(/if\s\(event\.event\.type\s===\s"session\.skills_loaded"\)\s\{[\s\S]*?\}\s*if\s\(event\.event/g, 'if (event.event');

fs.writeFileSync('client/src/agentEventPresenter.ts', presenter);
