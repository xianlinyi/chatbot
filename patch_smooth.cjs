const fs = require('fs');
let content = fs.readFileSync('client/src/App.tsx', 'utf-8');

// Fix normals in both parts (remove crazy corner boost to keep it perfectly radial / uniform stretch)
const regex1 = /vec2 n = normalize\(q\);\s*\n\s*float cornerBoost = 1\.0 \+ 0\.8 \* \(2\.0 \* n\.x \* n\.y\);[^\n]*\n\s*normal = n \* signP \* cornerBoost;/g;
content = content.replace(regex1, 'normal = normalize(q) * signP;');

// Lower the 0.75 amplitude down to something subtle like 0.4
const regex2 = /float amplitude = 0\.75 \* \(1\.0 - t\);/g;
content = content.replace(regex2, 'float amplitude = 0.35 * (1.0 - t);'); // less drastic stretch

fs.writeFileSync('client/src/App.tsx', content);
console.log('Fixed corners and amplitude');
