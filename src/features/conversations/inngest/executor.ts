import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

import { convex } from "@/lib/convex-client";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import type { IntentRoute } from "./intent-router";
import { extractQuotedValues } from "./arg-normalizer";
import { planAndCreateApp } from "./app-planner";

interface ExecutorParams {
  internalKey: string;
  projectId: Id<"projects">;
  message: string;
  route: IntentRoute;
}

interface ExecutorResult {
  handled: boolean;
  response: string;
}

const APP_NAME_STOPWORDS = new Set([
  "react",
  "vite",
  "next",
  "nextjs",
  "todo",
  "app",
  "project",
  "website",
  "simple",
  "basic",
  "new",
]);

const sanitizeAppName = (value: string): string | null => {
  const cleaned = value.trim().replace(/["'`.,!?]+$/g, "");
  if (!cleaned) return null;
  if (!/^[a-zA-Z0-9_-]{2,}$/.test(cleaned)) return null;
  if (APP_NAME_STOPWORDS.has(cleaned.toLowerCase())) return null;
  return cleaned;
};

const extractAppNames = (message: string): string[] => {
  const names = new Set<string>();

  const quoted = extractQuotedValues(message);
  for (const item of quoted) {
    const candidate = sanitizeAppName(item);
    if (candidate) {
      names.add(candidate);
    }
  }

  const calledOrNamed =
    /\b(?:called|named)\s+["'`]?([a-zA-Z0-9_-]{2,})["'`]?/gi;
  for (const match of message.matchAll(calledOrNamed)) {
    const candidate = sanitizeAppName(match[1] ?? "");
    if (candidate) {
      names.add(candidate);
    }
  }

  const leadingName =
    /\b(?:create|make|build|scaffold|setup|generate)\s+["'`]?([a-zA-Z0-9_-]{2,})["'`]?\s+(?:app|project|website)\b/gi;
  for (const match of message.matchAll(leadingName)) {
    const candidate = sanitizeAppName(match[1] ?? "");
    if (candidate) {
      names.add(candidate);
    }
  }

  return [...names];
};

const resolveFileByName = (
  files: Array<{
    _id: Id<"files">;
    name: string;
    type: "file" | "folder";
  }>,
  fileName: string
) => {
  const normalized = fileName.toLowerCase();
  return files.find(
    (f) =>
      f.type === "file" &&
      (f.name.toLowerCase() === normalized ||
        f.name.toLowerCase().endsWith(`/${normalized}`))
  );
};

const resolveFolderByName = (
  files: Array<{
    _id: Id<"files">;
    name: string;
    type: "file" | "folder";
  }>,
  folderName: string
) => {
  const normalized = folderName.toLowerCase();
  return files.find(
    (f) =>
      f.type === "folder" &&
      (f.name.toLowerCase() === normalized ||
        f.name.toLowerCase().endsWith(`/${normalized}`))
  );
};

const resolveItemByName = (
  files: Array<{
    _id: Id<"files">;
    name: string;
    type: "file" | "folder";
  }>,
  targetName: string
) => {
  const normalized = targetName.toLowerCase().trim();
  return (
    files.find(
      (f) =>
        f.name.toLowerCase() === normalized ||
        f.name.toLowerCase().endsWith(`/${normalized}`)
    ) ?? null
  );
};

const extractRenamePair = (
  message: string,
  route: IntentRoute
): { from: string; to: string } | null => {
  const quoted = extractQuotedValues(message);
  if (quoted.length >= 2) {
    return { from: quoted[0], to: quoted[1] };
  }

  if (route.fileNames.length >= 2) {
    return { from: route.fileNames[0], to: route.fileNames[1] };
  }

  if (route.folderNames.length >= 2) {
    return { from: route.folderNames[0], to: route.folderNames[1] };
  }

  return null;
};

const generateUpdatedContent = async ({
  fileName,
  existingContent,
  instruction,
}: {
  fileName: string;
  existingContent: string;
  instruction: string;
}) => {
  const ollama = createOpenAI({
    baseURL: process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434/v1",
    apiKey: process.env.OLLAMA_API_KEY ?? "ollama",
  });
  const model = process.env.CONVERSATION_MODEL ?? process.env.SUGGESTION_MODEL ?? "qwen2.5-coder:7b";

  const { text } = await generateText({
    model: ollama(model),
    prompt: [
      "You are updating a file.",
      "Return ONLY the final full file content.",
      "Do not add markdown fences.",
      `File name: ${fileName}`,
      "Current content:",
      existingContent,
      "User request:",
      instruction,
    ].join("\n\n"),
  });

  return text.trim();
};

export const runDeterministicExecutor = async ({
  internalKey,
  projectId,
  message,
  route,
}: ExecutorParams): Promise<ExecutorResult> => {
  const lowerMessage = message.toLowerCase();
  const files = await convex.query(api.system.getProjectFiles, {
    internalKey,
    projectId,
  });

  if (route.action === "create_app") {
    let parentId: Id<"files"> | undefined;
    if (route.parentFolderName) {
      const parent = resolveFolderByName(files, route.parentFolderName);
      if (!parent) {
        return {
          handled: true,
          response: `I couldn't find the folder "${route.parentFolderName}".`,
        };
      }
      parentId = parent._id;
    }

    const inferredFromPhrase = extractAppNames(message);
    const folderTargets = [...new Set([...route.folderNames, ...inferredFromPhrase])].filter(Boolean);

    if (folderTargets.length === 0) {
      return {
        handled: true,
        response:
          "Please provide the app folder name, for example: \"create a Next.js app named myapp\".",
      };
    }

    const summaries: string[] = [];
    const failures: string[] = [];
    const runGuides: string[] = [];

    for (const folderName of folderTargets) {
      try {
        const result = await planAndCreateApp({
          internalKey,
          projectId,
          message,
          preferredRootFolder: folderName,
          parentId,
        });

        summaries.push(
          `${result.rootFolder} (${result.framework}): ${result.createdFolders} folder(s), ${result.createdFiles} file(s), ${result.updatedFiles} updated\n${result.summary}`
        );
        runGuides.push(
          `${result.rootFolder}:\n${result.runInstructions.map((cmd) => `- ${cmd}`).join("\n")}`
        );
      } catch (error) {
        failures.push(
          `${folderName} (${error instanceof Error ? error.message : "Unknown error"})`
        );
      }
    }

    if (summaries.length > 0 && failures.length === 0) {
      return {
        handled: true,
        response: `Scaffolded app(s):\n${summaries.join("\n\n")}\n\nHow to run:\n${runGuides.join("\n\n")}`,
      };
    }

    if (summaries.length > 0) {
      return {
        handled: true,
        response: `Scaffolded app(s):\n${summaries.join("\n\n")}\n\nHow to run:\n${runGuides.join("\n\n")}\n\nFailed: ${failures.join(", ")}`,
      };
    }

    return {
      handled: true,
      response: `Could not create app(s): ${failures.join(", ")}`,
    };
  }

  if (route.action === "list_files") {
    const lower = message.toLowerCase();
    const onlyPython = lower.includes("python") || lower.includes(".py");
    const onlyNames =
      lower.includes("only names") ||
      lower.includes("only their names") ||
      lower.includes("just names");

    const fileNames = files
      .filter((f) => f.type === "file")
      .map((f) => f.name)
      .sort((a, b) => a.localeCompare(b));

    const filtered = onlyPython
      ? fileNames.filter((name) => name.toLowerCase().endsWith(".py"))
      : fileNames;

    if (filtered.length === 0) {
      return {
        handled: true,
        response: onlyPython
          ? "You don't have any Python (.py) files in this project."
          : "Your project currently has no files.",
      };
    }

    return {
      handled: true,
      response: onlyNames
        ? filtered.join("\n")
        : `Files:\n${filtered.map((name) => `- ${name}`).join("\n")}`,
    };
  }

  if (route.action === "read_file") {
    if (route.fileNames.length === 0) {
      return {
        handled: true,
        response: "Please specify a file name to read, for example: \"index.py\".",
      };
    }

    const outputs: string[] = [];
    for (const fileName of route.fileNames) {
      const file = resolveFileByName(files, fileName);
      if (!file) continue;

      const fullFile = await convex.query(api.system.getFileById, {
        internalKey,
        fileId: file._id,
      });

      outputs.push(`${fullFile?.name ?? fileName}\n\`\`\`\n${fullFile?.content ?? ""}\n\`\`\``);
    }

    if (outputs.length === 0) {
      return {
        handled: true,
        response: "I couldn't find the requested file.",
      };
    }

    return { handled: true, response: outputs.join("\n\n") };
  }

  if (route.action === "create_folder") {
    if (route.folderNames.length === 0) {
      return {
        handled: true,
        response: "Please provide the folder name to create, for example: \"components\".",
      };
    }

    let parentId: Id<"files"> | undefined;
    if (route.parentFolderName) {
      const parent = resolveFolderByName(files, route.parentFolderName);
      if (!parent) {
        return {
          handled: true,
          response: `I couldn't find the folder "${route.parentFolderName}".`,
        };
      }
      parentId = parent._id;
    }

    const created: string[] = [];
    const failed: string[] = [];

    for (const folderName of route.folderNames) {
      try {
        await convex.mutation(api.system.createFolder, {
          internalKey,
          projectId,
          name: folderName,
          parentId,
        });
        created.push(folderName);
      } catch (error) {
        failed.push(`${folderName} (${error instanceof Error ? error.message : "Unknown error"})`);
      }
    }

    if (created.length > 0 && failed.length === 0) {
      return { handled: true, response: `Created folder(s): ${created.join(", ")}` };
    }
    if (created.length > 0) {
      return {
        handled: true,
        response: `Created: ${created.join(", ")}. Failed: ${failed.join(", ")}`,
      };
    }
    return { handled: true, response: `Could not create folders: ${failed.join(", ")}` };
  }

  if (route.action === "create_file") {
    if (route.fileNames.length === 0) {
      return {
        handled: true,
        response: "Please provide file name(s) to create, for example: \"app.js\".",
      };
    }

    let parentId: Id<"files"> | undefined;
    if (route.parentFolderName) {
      const parent = resolveFolderByName(files, route.parentFolderName);
      if (!parent) {
        return {
          handled: true,
          response: `I couldn't find the folder "${route.parentFolderName}".`,
        };
      }
      parentId = parent._id;
    }

    const existingTargets = route.fileNames
      .map((name) => resolveFileByName(files, name))
      .filter((f): f is NonNullable<typeof f> => Boolean(f));

    const shouldTreatAsUpdate =
      existingTargets.length > 0 &&
      (
        /\b(write|update|edit|modify|change|rewrite|replace|implement|fix)\b/.test(lowerMessage) ||
        (
          /\b(create|make)\b/.test(lowerMessage) &&
          /\b(function|program|logic|algorithm|code)\b/.test(lowerMessage)
        )
      );

    if (shouldTreatAsUpdate) {
      const target = existingTargets[0];
      const fullFile = await convex.query(api.system.getFileById, {
        internalKey,
        fileId: target._id,
      });

      const existingContent = fullFile?.content ?? "";
      const newContent = route.explicitContent?.trim()
        ? route.explicitContent.trim()
        : await generateUpdatedContent({
            fileName: fullFile?.name ?? target.name,
            existingContent,
            instruction: message,
          });

      await convex.mutation(api.system.updateFile, {
        internalKey,
        fileId: target._id,
        content: newContent,
      });

      const verify = await convex.query(api.system.getFileById, {
        internalKey,
        fileId: target._id,
      });

      if (verify?.content !== newContent) {
        return {
          handled: true,
          response: `I attempted to update ${fullFile?.name ?? target.name}, but verification failed. Please retry.`,
        };
      }

      return {
        handled: true,
        response: `Updated ${fullFile?.name ?? target.name} successfully.`,
      };
    }

    const results = await convex.mutation(api.system.createFiles, {
      internalKey,
      projectId,
      parentId,
      files: route.fileNames.map((name) => ({
        name,
        content: route.explicitContent ?? "",
      })),
    });

    const created = results.filter((r) => !r.error).map((r) => r.name);
    const failed = results.filter((r) => r.error).map((r) => `${r.name} (${r.error})`);

    if (created.length > 0 && failed.length === 0) {
      return { handled: true, response: `Created file(s): ${created.join(", ")}` };
    }
    if (created.length > 0) {
      return {
        handled: true,
        response: `Created: ${created.join(", ")}. Failed: ${failed.join(", ")}`,
      };
    }
    return { handled: true, response: `Could not create files: ${failed.join(", ")}` };
  }

  if (route.action === "update_file") {
    if (route.fileNames.length === 0) {
      return {
        handled: true,
        response: "Please provide the file name to update, for example: \"index.py\".",
      };
    }

    const targetName = route.fileNames[0];
    const file = resolveFileByName(files, targetName);
    if (!file) {
      return {
        handled: true,
        response: `I couldn't find "${targetName}" in the project.`,
      };
    }

    const fullFile = await convex.query(api.system.getFileById, {
      internalKey,
      fileId: file._id,
    });

    const existingContent = fullFile?.content ?? "";
    const newContent = route.explicitContent?.trim()
      ? route.explicitContent.trim()
      : await generateUpdatedContent({
          fileName: fullFile?.name ?? targetName,
          existingContent,
          instruction: message,
        });

    await convex.mutation(api.system.updateFile, {
      internalKey,
      fileId: file._id,
      content: newContent,
    });

    const verify = await convex.query(api.system.getFileById, {
      internalKey,
      fileId: file._id,
    });

    if (verify?.content !== newContent) {
      return {
        handled: true,
        response: `I attempted to update ${fullFile?.name ?? targetName}, but verification failed. Please retry.`,
      };
    }

    return {
      handled: true,
      response: `Updated ${fullFile?.name ?? targetName} successfully.`,
    };
  }

  if (route.action === "delete_file") {
    const targets = [...new Set([...route.fileNames, ...route.folderNames])];

    if (targets.length === 0) {
      return {
        handled: true,
        response:
          "Please specify what to delete, for example: \"delete efg.jsx\".",
      };
    }

    const deleted: string[] = [];
    const missing: string[] = [];

    for (const target of targets) {
      const item = resolveItemByName(files, target);
      if (!item) {
        missing.push(target);
        continue;
      }

      await convex.mutation(api.system.deleteFile, {
        internalKey,
        fileId: item._id,
      });

      deleted.push(item.name);
    }

    if (deleted.length > 0 && missing.length === 0) {
      return {
        handled: true,
        response: `Deleted: ${deleted.join(", ")}`,
      };
    }

    if (deleted.length > 0) {
      return {
        handled: true,
        response: `Deleted: ${deleted.join(", ")}. Not found: ${missing.join(", ")}`,
      };
    }

    return {
      handled: true,
      response: `I couldn't find: ${missing.join(", ")}`,
    };
  }

  if (route.action === "rename_file") {
    const renamePair = extractRenamePair(message, route);
    if (!renamePair) {
      return {
        handled: true,
        response:
          "Please provide both old and new names, for example: \"rename efg.jsx to base.js\".",
      };
    }

    const item = resolveItemByName(files, renamePair.from);
    if (!item) {
      return {
        handled: true,
        response: `I couldn't find "${renamePair.from}" in the project.`,
      };
    }

    await convex.mutation(api.system.renameFile, {
      internalKey,
      fileId: item._id,
      newName: renamePair.to,
    });

    return {
      handled: true,
      response: `Renamed "${item.name}" to "${renamePair.to}" successfully.`,
    };
  }

  return { handled: false, response: "" };
};
