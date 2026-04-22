const fs = require('fs');
let content = fs.readFileSync('server/src/routes/api.ts', 'utf-8');

const oldCode = `    // Output to project root
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

const newCode = `    // Output to project root
    const rootDir = process.cwd();
    const outputFile = path.join(rootDir, "bot_output.log");
    let botFullText = "";

    for await (const event of stream) {
      if (reply.raw.destroyed) {
        break;
      }

      if (event.type === "delta" && event.content) {
         botFullText += event.content;
      }

      // Log exactly what the bot returns to the file
      fs.appendFileSync(outputFile, JSON.stringify(event) + "\\n", "utf8");

      writeSse(reply.raw, event);
    }
    
    if (botFullText.trim()) {
       // Also save just the pure text to a markdown file
       fs.appendFileSync(path.join(rootDir, "bot_response_text.md"), botFullText + "\\n\\n---\\n\\n", "utf8");
    }`;

content = content.replace(oldCode, newCode);
fs.writeFileSync('server/src/routes/api.ts', content);
