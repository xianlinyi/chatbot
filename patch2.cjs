const fs = require('fs');
const content = fs.readFileSync('client/src/App.tsx', 'utf-8');
const newContent = content.replace(
`          // 根据法线y分量计算，左右侧边保持12，上下横边扩大至24
          float currentEdgeWidth = mix(12.0, 24.0, abs(normal.y));`,
`          // 全部统一变宽 24
          float currentEdgeWidth = 24.0;`);
fs.writeFileSync('client/src/App.tsx', newContent);
