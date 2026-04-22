const fs = require('fs');
const content = fs.readFileSync('client/src/App.tsx', 'utf-8');
const newContent = content.replace(
`          vec2 disp = vec2(0.0);
          
          // 动态边缘厚度：左右 12，上下横边 24
          float currentEdgeWidth = mix(12.0, 24.0, abs(normal.y));

          // If within the edge boundary volume
          if (distToBoundary >= 0.0 && distToBoundary <= currentEdgeWidth) {
              float t = distToBoundary / currentEdgeWidth;
              // 取消任何会产生对称折返的三角函数(如cos波形)。
              // 使用二次平滑衰减曲线(Quadratic Decay): t=0时达到最大厚度，t=1时曲率归零。
              // 它的导数始终单调递减且不会越界，这意味着图像在这个倒角内只会被**纯粹地单向拉长**，
              // 而绝对不会出现采样反转交叉，从而形成你所说的那条“对称中线”。
              float amplitude = (1.0 - t) * (1.0 - t);
              // 反向法线(-normal)意味着：外边缘向内读取图像，呈现透镜放大拉伸
              // 动态调整形变强度因子以适配厚度比例：厚度越大拉长越远，配合全局 的 scale="24"
              disp = -normal * amplitude * (currentEdgeWidth / 24.0); 
          }`,
`          vec2 disp = vec2(0.0);
          
          // 统一 24 像素的厚度
          float currentEdgeWidth = 24.0;

          // If within the edge boundary volume
          if (distToBoundary >= 0.0 && distToBoundary <= currentEdgeWidth) {
              float t = distToBoundary / currentEdgeWidth;
              // 取消任何会产生对称折返的三角函数(如cos波形)。
              // 使用二次平滑衰减曲线(Quadratic Decay): t=0时达到最大厚度，t=1时曲率归零。
              // 它的导数始终单调递减且不会越界，这意味着图像在这个倒角内只会被**纯粹地单向拉长**，
              // 而绝对不会出现采样反转交叉，从而形成你所说的那条“对称中线”。
              float amplitude = (1.0 - t) * (1.0 - t);
              // 反向法线(-normal)意味着：外边缘向内读取图像，呈现透镜放大拉伸
              disp = -normal * amplitude * 1.0; 
          }`);
fs.writeFileSync('client/src/App.tsx', newContent);
