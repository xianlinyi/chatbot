const fs = require('fs');
let content = fs.readFileSync('client/src/App.tsx', 'utf-8');

// 1. Unified width 24.0 in BOTH shaders
content = content.replace(
  /\/\/ 根据法线y分量计算，左右侧边保持12，上下横边扩大至24\n\s*\/\/ float currentEdgeWidth = mix\(12\.0, 24\.0, abs\(normal\.y\)\); \n\s*\/\/ 现将所有边框统一设为 24px：\n\s*float currentEdgeWidth = 24\.0;/g,
  '// 现将所有边框统一设为 24px：\n          float currentEdgeWidth = 24.0;'
);

content = content.replace(
  /\/\/ 动态边缘厚度：左右 12，上下横边 24\n\s*float currentEdgeWidth = mix\(12\.0, 24\.0, abs\(normal\.y\)\);/g,
  '// 统一 24 像素的厚度\n          float currentEdgeWidth = 24.0;'
);

// 2. Fix the sign issue in normalMaterial EXACTLY
// Replace disp calculation and mapping in normalMaterial
const oldNormalDispCode = `              // 动态调整形变强度因子以适配厚度比例：厚度越大拉长越远，配合全局 的 scale="24"
              disp = -normal * amplitude * (currentEdgeWidth / 24.0); 
          }
          
          // Mapping disp to RGB channels (0 to 1) for the SVG DisplacementMap.
          // Invert both X and Y.
          vec2 colorData = clamp(vec2(-disp.x, -disp.y) * 0.5 + 0.5, 0.0, 1.0);`;

const newNormalDispCode = `              // 因为四边都统一到了 24 像素宽，直接按照满幅缩放拉长 (scale="24")
              // X 轴原样取法线的反向 (-normal.x)，因为 SVG 往右拉取也是 DX > 0
              // Y 轴取正向 (+normal.y)，因为 SVG 往下拉取是 DY > 0，这里与 WebGL 体系上下反转
              disp = vec2(-normal.x, normal.y) * amplitude * 1.0; 
          }
          
          // Mapping disp to RGB channels
          vec2 colorData = clamp(vec2(disp.x, disp.y) * 0.5 + 0.5, 0.0, 1.0);`;

content = content.replace(oldNormalDispCode, newNormalDispCode);

fs.writeFileSync('client/src/App.tsx', content);
