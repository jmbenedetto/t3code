// @effect-diagnostics nodeBuiltinImport:off -- This extension runs in the real Pi subprocess, outside Effect.
import {
  createAssistantMessageEventStream,
  getCurrentSystemPrompt,
  type AssistantMessage,
} from "@earendil-works/pi-ai";
import {
  createReadToolDefinition,
  createWriteToolDefinition,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";

export default function fixture(pi: ExtensionAPI) {
  // A fixture must never fall back to a network provider, even if the host has credentials.
  globalThis.fetch = () => Promise.reject(new Error("Network is disabled in the Pi fixture"));
  const replacement = process.env.T3_PI_FIXTURE_REPLACEMENT;
  const executeReplacement = async () => ({
    content: [{ type: "text" as const, text: "FIXTURE_REPLACEMENT_EXECUTED" }],
    details: undefined,
  });
  if (replacement === "read")
    pi.registerTool({ ...createReadToolDefinition(process.cwd()), execute: executeReplacement });
  if (replacement === "write")
    pi.registerTool({ ...createWriteToolDefinition(process.cwd()), execute: executeReplacement });
  pi.registerProvider("t3-fixture", {
    api: "t3-fixture",
    baseUrl: "https://fixture.invalid",
    apiKey: "fixture-not-a-credential",
    models: [
      {
        id: "echo",
        name: "Offline fixture",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 100_000,
        maxTokens: 4_096,
      },
    ],
    streamSimple(model, context) {
      const stream = createAssistantMessageEventStream();
      const tool = process.env.T3_PI_FIXTURE_TOOL;
      const callTool =
        (tool === "read" || tool === "write") && context.messages.at(-1)?.role !== "toolResult";
      const message: AssistantMessage = {
        role: "assistant" as const,
        content: callTool
          ? [
              {
                type: "toolCall",
                id: "fixture-tool-call",
                name: tool,
                arguments: {
                  path: "fixture.txt",
                  ...(tool === "write" ? { content: "FIXTURE_WRITTEN" } : {}),
                },
              },
            ]
          : [
              {
                type: "text" as const,
                text: JSON.stringify({ system: getCurrentSystemPrompt(context.messages) }),
              },
            ],
        api: model.api,
        provider: model.provider,
        model: model.id,
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: callTool ? "toolUse" : "stop",
        timestamp: 0,
      };
      stream.push({ type: "start", partial: message });
      stream.push({ type: "done", reason: callTool ? "toolUse" : "stop", message });
      stream.end();
      return stream;
    },
  });
  pi.registerCommand("fixture-reload", {
    description: "Reload harmless fixture resources",
    handler: async (_args, ctx) => {
      await ctx.reload();
    },
  });
  pi.registerCommand("fixture-presentation", {
    description: "Emit harmless RPC presentation fixtures",
    handler: async (_args, ctx) => {
      ctx.ui.setTitle("Fixture title");
      ctx.ui.setStatus("fixture", "Fixture status");
      ctx.ui.setWidget("fixture", ["First", "Second"], { placement: "belowEditor" });
      ctx.ui.setEditorText("  Exact draft\n");
      ctx.ui.notify("Fixture notice", "warning");
    },
  });
  pi.on("input", (event) => (event.text === "fixture-handled" ? { action: "handled" } : undefined));
}
