const fs = require('fs');
let content = fs.readFileSync('client/src/App.tsx', 'utf-8');

const regex = /\/\/\s*取消任何会产生对称折返的三角函数[\s\S]*?disp\s*=\s*vec2\(-normal\.x,\s*-normal\.y\)\s*\*\s*amplitude\s*\*\s*1\.0;/;

const newCode = `// 为实现“纯粹单向拉伸”并彻底消除“折返/对称镜像线”的过度视觉：
              // 必须保证坐标采样函数单调不交叉！SVG max scale=64 (单侧最大偏移32px)。
              // 在24px物理厚度上，如果使用二次衰减且偏移总量>24，向内侧读取时必定反转交叉！
              // 所以我们要采取 24/32 = 0.75 强力安全限位，搭配完美的纯线性单调过渡。
              float amplitude = 0.75 * (1.0 - t);
              // X取反向(-normal.x)，Y取正向(+normal.y)，刚好能统一从所有边的中心内侧拉取画面像素
              disp = vec2(-normal.x, normal.y) * amplitude;`;

if(regex.test(content)) {
  content = content.replace(regex, newCode);
  fs.writeFileSync('client/src/App.tsx', content);
  console.log("Patched successfully!");
} else {
  console.log("Could not find regex match!");
}
