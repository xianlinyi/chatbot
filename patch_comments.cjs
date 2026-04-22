const fs = require('fs');
let content = fs.readFileSync('client/src/App.tsx', 'utf-8');

// clean up old messy comments about cornerBoost
const regex3 = /\/\/ 增强拐角处[^\n]*\n\s*\/\/ 使对角线方向[^\n]*\n\s*(normal = normalize\(q\) \* signP;)/g;
content = content.replace(regex3, '$1');

fs.writeFileSync('client/src/App.tsx', content);
