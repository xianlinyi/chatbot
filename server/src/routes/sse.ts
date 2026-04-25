import type { AgentStreamEvent } from "../providers/types.js";

export function writeSse(response: NodeJS.WritableStream, event: AgentStreamEvent): void {
  response.write(`event: ${event.type}\n`);
  response.write(`data: ${JSON.stringify(event)}\n\n`);
}
