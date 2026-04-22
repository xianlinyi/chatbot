const fs = require('fs');
let presenter = fs.readFileSync('client/src/agentEventPresenter.ts', 'utf-8');
presenter = presenter.replace(/if\s*\(event\.event\.type\s*===\s*"session\.skills_loaded"\)\s*\{[\s\S]*?\}\s*if\s*\(event\.event/g, 'if (event.event');
fs.writeFileSync('client/src/agentEventPresenter.ts', presenter);
