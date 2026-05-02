import path from "node:path";
import type { BusinessConcept, ContextBundle, ProjectContext, SystemContext, TaskSpec } from "../model/agentTypes.js";

export class ContextProvider {
  constructor(private readonly workspaceRoot = process.cwd()) {}

  async load(taskSpec: TaskSpec): Promise<ContextBundle> {
    const projects = [this.chatbotProject()];
    const concepts = this.concepts().filter((concept) => matchesConcept(concept, taskSpec));
    const systems = this.systems().filter((system) => !taskSpec.domain || system.domain === taskSpec.domain);

    return {
      projects,
      concepts,
      systems,
      memory: {
        loadedAt: new Date().toISOString()
      }
    };
  }

  private chatbotProject(): ProjectContext {
    return {
      name: "chatbot",
      aliases: ["chatbot", "聊天机器人", "bot 项目"],
      path: this.workspaceRoot,
      repo: true,
      framework: "React + Fastify",
      packageManager: "npm",
      commands: {
        test: "npm test",
        build: "npm run build"
      },
      structure: {
        client: "client/src",
        server: "server/src",
        components: "client/src/components",
        providers: "server/src/providers"
      },
      policies: ["不自动 push", "修改前必须查看 git diff", "修复后必须运行 lint 或 test"]
    };
  }

  private concepts(): BusinessConcept[] {
    return [
      {
        name: "payment_proof",
        aliases: ["payment proof", "支付凭证", "付款凭证", "proof"],
        domain: "payment",
        type: "artifact",
        metadata: {
          source_event: "payment_success",
          generator: "proof-service",
          delivery_service: "notification-service",
          delivery_channel: "email",
          lifecycle: [
            "payment_success",
            "proof_generated",
            "proof_event_published",
            "notification_created",
            "delivery_sent",
            "delivery_confirmed"
          ]
        }
      }
    ];
  }

  private systems(): SystemContext[] {
    return [
      { name: "payment-service", domain: "payment", owns: ["payment_order"], logs: ["payment-service-logs"] },
      {
        name: "proof-service",
        domain: "payment",
        owns: ["payment_proof"],
        publishes: ["payment.proof.created"],
        logs: ["proof-service-logs"]
      },
      {
        name: "notification-service",
        domain: "notification",
        owns: ["notification_record"],
        consumes: ["payment.proof.created"],
        logs: ["notification-service-logs"]
      },
      { name: "chatbot", domain: "engineering", owns: [path.basename(this.workspaceRoot)] }
    ];
  }
}

function matchesConcept(concept: BusinessConcept, taskSpec: TaskSpec): boolean {
  if (taskSpec.domain && concept.domain === taskSpec.domain) {
    return true;
  }

  const input = taskSpec.rawInput.toLowerCase();
  return concept.aliases.some((alias) => input.includes(alias.toLowerCase()));
}
