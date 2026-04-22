const fs = require('fs');
let content = fs.readFileSync('client/src/App.tsx', 'utf-8');

// Fix the colorData mapping
content = content.replace(
  /vec2 colorData = clamp\(vec2\(-disp\.x, -disp\.y\) \* 0\.5 \+ 0\.5, 0\.0, 1\.0\);/g,
  'vec2 colorData = clamp(vec2(disp.x, -disp.y) * 0.5 + 0.5, 0.0, 1.0);'
);

// Fix the width unifying (first shader)
content = content.replace(
  /\/\/ 统一所有边缘厚度为 12 像素\n\s*float currentEdgeWidth = 12\.0; \n/g,
  '// 统一边缘厚度为 24 像素\n          float currentEdgeWidth = 24.0;\n'
);
content = content.replace(
  /\/\/ 动态边缘厚度：左右 12，上下横边 24\n\s*float currentEdgeWidth = mix\(12\.0, 24\.0, abs\(normal\.y\)\);\n/g,
  '// 全部统一变宽 24\n          float currentEdgeWidth = 24.0;\n'
);
content = content.replace(
  /\/\/ 根据法线y分量计算，左右侧边保持12，上下横边扩大至24\n\s*float currentEdgeWidth = mix\(12\.0, 24\.0, abs\(normal\.y\)\); \n/g,
  '// 全部统一变宽 24\n          float currentEdgeWidth = 24.0;\n'
);

// Fix the amplitude math factor -> change (currentEdgeWidth / 24.0) to 1.0
content = content.replace(
  /disp = -normal \* amplitude \* \(currentEdgeWidth \/ 24\.0\);/g,
  'disp = -normal * amplitude * 1.0;'
);

fs.writeFileSync('client/src/App.tsx', content);
