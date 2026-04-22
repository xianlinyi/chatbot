const fs = require('fs');
let content = fs.readFileSync('client/src/App.tsx', 'utf-8');
content = content.replace('    }););', '    });');
fs.writeFileSync('client/src/App.tsx', content);
