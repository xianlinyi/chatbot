const fs = require('fs');

let content = fs.readFileSync('server/src/routes/api.ts', 'utf-8');

// Import path and fs
if (!content.includes('import * as fs')) {
  content = `import * as fs from "node:fs";\nimport * as path from "node:path";\n` + content;
}

const targetLoop = `    for await (const event of stream) {
      if (reply.raw.destroyed) {
        break;
      }

      writeSse(reply.raw, event);
    }`;

const replacedLoop = `    // Output to project root
    const rootDir = process.cwd();
    const outputFile = path.join(rootDir, "bot_output.log");
    let fullResponse = "";

    for await (const event of stream) {
      if (reply.raw.destroyed) {
        break;
      }

      // Log exactly what the bot returns to the file
      fs.appendFileSync(outputFile, JSON.stringify(event) + "\\n", "utf8");

      writeSse(reply.raw, event);
    }`;

content = content.replace(targetLoop, replacedLoop);

fs.writeFileSync('server/src/routes/api.ts', content);
