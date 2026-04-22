const fs = require('fs');
let content = fs.readFileSync('client/src/App.tsx', 'utf-8');
content = content.replace('const hasRunning = activities.some(a => a.status === "running");\n\n  return (', 'return (');
fs.writeFileSync('client/src/App.tsx', content);
