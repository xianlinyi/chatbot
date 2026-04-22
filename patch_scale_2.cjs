const fs = require('fs');
let content = fs.readFileSync('client/src/App.tsx', 'utf-8');

const regexShader = /vec2 normal = vec2\(0\.0\);\s*if \(q\.x > 0\.0 && q\.y > 0\.0\) \{\s*normal = normalize\(q\) \* signP;\s*\} else if \(q\.x > q\.y\) \{/g;

const newShader = `vec2 normal = vec2(0.0);
          if (q.x > 0.0 && q.y > 0.0) {
              // 增强拐角处的法线向量长度，补偿 normalize 导致的 0.707 衰减
              // 使对角线方向的形变拉扯力度恢复甚至超过直边，达到更强烈的张力
              vec2 n = normalize(q);
              float cornerBoost = 1.0 + 0.8 * (2.0 * n.x * n.y); // 在 45 度角时大幅增强
              normal = n * signP * cornerBoost;
          } else if (q.x > q.y) {`;

content = content.replace(regexShader, newShader);
fs.writeFileSync('client/src/App.tsx', content);
