import { createAgent, createNetwork } from "@inngest/agent-kit";
import { openai } from "@inngest/ai/models";

import { inngest } from "@/inngest/client";
import { convex } from "@/lib/convex-client";
import { NonRetriableError } from "inngest";

import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import {
  CODING_AGENT_SYSTEM_PROMPT,
} from "./constants";
import { routeIntent } from "./intent-router";
import { runDeterministicExecutor } from "./executor";
import { createListFilesTool } from "./tools/list-files";
import { createReadFilesTool } from "./tools/read-file";
import { createUpdateFileTool } from "./tools/update-files";
import { createCreateFilesTool } from "./tools/create-files";
import { createCreateFolderTool } from "./tools/create-folder";
import { createRenameFileTool } from "./tools/rename-file";
import { createDeleteFilesTool } from "./tools/delete-files";
import { createScrapeUrlsTool } from "./tools/scrape-urls";

interface MessageEvent {
  messageId: Id<"messages">;
  conversationId: Id<"conversations">;
  projectId: Id<"projects">;
  message: string;
}

const stripToolCallJsonFromText = (text: string): string => {
  let cleaned = text;

  cleaned = cleaned.replace(/```json\s*[\s\S]*?```/gi, (block) => {
    const looksLikeToolCall =
      /"name"\s*:\s*"(listFiles|readFiles|updateFile|createFiles|createFolder|renameFile|deleteFiles|scrapeUrls)"/i.test(
        block
      ) && /"arguments"\s*:/i.test(block);
    return looksLikeToolCall ? "" : block;
  });

  cleaned = cleaned.replace(
    /\{\s*"name"\s*:\s*"(listFiles|readFiles|updateFile|createFiles|createFolder|renameFile|deleteFiles|scrapeUrls)"[\s\S]*?"arguments"\s*:\s*\{[\s\S]*?\}\s*\}/gi,
    ""
  );

  cleaned = cleaned.replace(/^\s*json\s*$/i, "");
  return cleaned.trim();
};

const getHistoryText = (
  recentMessages: Array<{ _id: Id<"messages">; role: string; content: string }>,
  currentMessageId: Id<"messages">
) => {
  const contextMessages = recentMessages.filter(
    (msg) => msg._id !== currentMessageId && msg.content.trim() !== ""
  );

  if (contextMessages.length === 0) {
    return "";
  }

  return contextMessages
    .map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`)
    .join("\n\n");
};

const buildSystemPrompt = (historyText: string) => {
  let prompt = CODING_AGENT_SYSTEM_PROMPT;

  if (historyText) {
    prompt += `\n\n## Previous Conversation (context only)\n${historyText}`;
  }

  prompt +=
    "\n\n## Tooling Contract\nUse tools for project operations. Never output raw tool-call JSON in final response.";
  prompt +=
    "\nAvailable tools: listFiles, readFiles, updateFile, createFiles, createFolder, renameFile, deleteFiles, scrapeUrls.";
  prompt +=
    "\nFor file/folder operations: resolve targets via listFiles first. For edits: readFiles before updateFile.";
  prompt +=
    "\nKeep user-facing responses concise and clear.";

  return prompt;
};

export const processMessage = inngest.createFunction(
  {
    id: "process-message",
    cancelOn: [
      {
        event: "message/cancel",
        if: "event.data.messageId == async.data.messageId",
      },
    ],
    onFailure: async ({ event, step }) => {
      const { messageId } = event.data.event.data as MessageEvent;
      const internalKey = process.env.NEONSCRIPT_CONVEX_INTERNAL_KEY;

      if (!internalKey) return;

      await step.run("update-message-on-failure", async () => {
        await convex.mutation(api.system.updateMessageContent, {
          internalKey,
          messageId,
          content:
            "My apologies, I encountered an error while processing your request. Let me know if you need anything else!",
        });
      });
    },
  },
  { event: "message/sent" },
  async ({ event, step }) => {
    const { messageId, conversationId, projectId, message } =
      event.data as MessageEvent;

    const internalKey = process.env.NEONSCRIPT_CONVEX_INTERNAL_KEY;
    if (!internalKey) {
      throw new NonRetriableError(
        "NEONSCRIPT_CONVEX_INTERNAL_KEY is not configured"
      );
    }

    const ollamaBaseUrl =
      process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434/v1";
    const ollamaApiKey = process.env.OLLAMA_API_KEY ?? "ollama";
    const conversationModel =
      process.env.CONVERSATION_MODEL ??
      process.env.SUGGESTION_MODEL ??
      "qwen2.5-coder:7b";

    await step.sleep("wait-for-db-sync", "1s");

    const conversation = await step.run("get-conversation", async () => {
      return await convex.query(api.system.getConversationById, {
        internalKey,
        conversationId,
      });
    });

    if (!conversation) {
      throw new NonRetriableError("Conversation not found");
    }

    const recentMessages = await step.run("get-recent-messages", async () => {
      return await convex.query(api.system.getRecentMessages, {
        internalKey,
        conversationId,
        limit: 12,
      });
    });

    const historyText = getHistoryText(recentMessages, messageId);

    // Title generation is intentionally disabled for now to keep response path fast.
    // TODO: move this to a non-blocking/background step after assistant response.
    // if (shouldGenerateTitle) {
    //   const titleAgent = createAgent({
    //     name: "title-generator",
    //     system: TITLE_GENERATOR_SYSTEM_PROMPT,
    //     model: openai({
    //       model: titleModel,
    //       baseUrl: ollamaBaseUrl,
    //       apiKey: ollamaApiKey,
    //       defaultParameters: { temperature: 0 },
    //     }) as any,
    //   });
    //
    //   const { output } = await titleAgent.run(message, { step });
    //   const titleMessage = output.find(
    //     (m) => m.type === "text" && m.role === "assistant"
    //   );
    //
    //   if (titleMessage?.type === "text") {
    //     const title =
    //       typeof titleMessage.content === "string"
    //         ? titleMessage.content.trim()
    //         : titleMessage.content.map((c) => c.text).join("").trim();
    //
    //     if (title) {
    //       await step.run("update-conversation-title", async () => {
    //         await convex.mutation(api.system.updateConversationTitle, {
    //           internalKey,
    //           conversationId,
    //           title,
    //         });
    //       });
    //     }
    //   }
    // }

    const routedIntent = await step.run("route-intent", async () => {
      return await routeIntent({ message });
    });

    if (routedIntent.action !== "unknown") {
      const deterministicResult = await step.run(
        "deterministic-executor",
        async () => {
          return await runDeterministicExecutor({
            internalKey,
            projectId,
            message,
            route: routedIntent,
          });
        }
      );

      if (deterministicResult.handled) {
        await step.run("update-assistant-message-deterministic", async () => {
          await convex.mutation(api.system.updateMessageContent, {
            internalKey,
            messageId,
            content: deterministicResult.response,
          });
        });

        return { success: true, messageId, conversationId };
      }
    }

    const codingAgent = createAgent({
      name: "NeonScript",
      description: "An expert AI coding assistant",
      system: buildSystemPrompt(historyText),
      model: openai({
        model: conversationModel,
        baseUrl: ollamaBaseUrl,
        apiKey: ollamaApiKey,
        defaultParameters: { temperature: 0.3 },
      }) as unknown as NonNullable<Parameters<typeof createAgent>[0]["model"]>,
      tools: [
        createListFilesTool({ internalKey, projectId }),
        createReadFilesTool({ internalKey }),
        createUpdateFileTool({ internalKey, projectId }),
        createCreateFilesTool({ projectId, internalKey }),
        createCreateFolderTool({ projectId, internalKey }),
        createRenameFileTool({ internalKey, projectId }),
        createDeleteFilesTool({ internalKey, projectId }),
        createScrapeUrlsTool(),
      ],
    });

    const network = createNetwork({
      name: "neonscript-network",
      agents: [codingAgent],
      maxIter: 20,
      router: ({ network }) => {
        const lastResult = network.state.results.at(-1);
        const hasTextResponse = lastResult?.output.some(
          (m) => m.type === "text" && m.role === "assistant"
        );
        const hasToolCalls = lastResult?.output.some(
          (m) => m.type === "tool_call"
        );

        if (hasTextResponse && !hasToolCalls) {
          return undefined;
        }

        return codingAgent;
      },
    });

    const result = await network.run(message);
    const lastResult = result.state.results.at(-1);
    const textMessage = lastResult?.output.find(
      (m) => m.type === "text" && m.role === "assistant"
    );

    let assistantResponse =
      "I processed your request. Let me know if you need anything else!";

    if (textMessage?.type === "text") {
      assistantResponse =
        typeof textMessage.content === "string"
          ? textMessage.content
          : textMessage.content.map((c) => c.text).join("");
    }

    assistantResponse = stripToolCallJsonFromText(assistantResponse);

    if (!assistantResponse) {
      const deterministicResult = await step.run(
        "deterministic-executor-empty-fallback",
        async () => {
          return await runDeterministicExecutor({
            internalKey,
            projectId,
            message,
            route: routedIntent,
          });
        }
      );

      assistantResponse =
        deterministicResult.handled && deterministicResult.response
          ? deterministicResult.response
          : "I processed your request. Let me know if you need anything else!";
    }

    await step.run("update-assistant-message", async () => {
      await convex.mutation(api.system.updateMessageContent, {
        internalKey,
        messageId,
        content: assistantResponse,
      });
    });

    return { success: true, messageId, conversationId };
  }
);
