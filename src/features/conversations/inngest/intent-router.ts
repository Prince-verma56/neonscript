import { z } from "zod";
import { generateObject } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

import {
  extractFileNames,
  extractFolderNames,
  extractParentFolderName,
  extractExplicitCodeContent,
  extractQuotedValues,
} from "./arg-normalizer";

const routeSchema = z.object({
  action: z.enum([
    "create_app",
    "create_file",
    "create_folder",
    "update_file",
    "read_file",
    "list_files",
    "delete_file",
    "rename_file",
    "unknown",
  ]),
  fileNames: z.array(z.string()).default([]),
  folderNames: z.array(z.string()).default([]),
  parentFolderName: z.string().optional(),
  explicitContent: z.string().optional(),
  confidence: z.number().min(0).max(1).default(0.5),
});

export type IntentRoute = z.infer<typeof routeSchema>;

interface RouteIntentParams {
  message: string;
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

  const calledOrNamed = /\b(?:called|named)\s+["'`]?([a-zA-Z0-9_-]{2,})["'`]?/gi;
  for (const match of message.matchAll(calledOrNamed)) {
    const candidate = sanitizeAppName(match[1] ?? "");
    if (candidate) {
      names.add(candidate);
    }
  }

  const leadingName = /\b(?:create|make|build|scaffold|setup|generate)\s+["'`]?([a-zA-Z0-9_-]{2,})["'`]?\s+(?:app|project|website)\b/gi;
  for (const match of message.matchAll(leadingName)) {
    const candidate = sanitizeAppName(match[1] ?? "");
    if (candidate) {
      names.add(candidate);
    }
  }

  return [...names];
};

const heuristicRoute = (message: string): IntentRoute => {
  const lower = message.toLowerCase();
  const fileNames = extractFileNames(message);
  const folderNames = extractFolderNames(message);
  const quotedValues = extractQuotedValues(message);

  const isCreateFolder =
    /\b(create|make|add|generate)\b/.test(lower) &&
    /\b(folder|directory)\b/.test(lower);
  const isCreateApp =
    /\b(create|make|add|generate|scaffold|setup|build|start)\b/.test(lower) &&
    /\b(app|project|website)\b/.test(lower) &&
    (/\breact\b/.test(lower) || /\bvite\b/.test(lower) || /\bnext(?:\.js|js)?\b/.test(lower));
  const isCreateFile =
    /\b(create|make|add|generate)\b/.test(lower) &&
    /\b(file|files)\b/.test(lower);
  const isLikelyEditInExistingFile =
    fileNames.length > 0 &&
    (
      /\b(write|update|edit|modify|change|rewrite|replace|implement|fix)\b/.test(lower) ||
      (
        /\b(create|make)\b/.test(lower) &&
        /\b(function|program|logic|algorithm|code)\b/.test(lower)
      )
    );
  const isRead =
    /\b(show|read|open|print|display)\b/.test(lower) &&
    (/\b(code|content|inside)\b/.test(lower) || fileNames.length > 0);
  const isUpdate =
    /\b(update|edit|modify|change|rewrite|replace|write|implement|fix|code)\b/.test(
      lower
    ) && fileNames.length > 0;
  const isList = /\b(list|show|which|what|find)\b/.test(lower) && /\bfiles?\b/.test(lower);
  const hasDeleteVerb = /\b(delete|remove)\b/.test(lower);
  const hasRenameVerb = /\b(rename)\b/.test(lower);
  const hasNamedTarget = fileNames.length > 0 || folderNames.length > 0 || quotedValues.length > 0;

  if (hasDeleteVerb && hasNamedTarget) {
    return {
      action: "delete_file",
      fileNames,
      folderNames,
      parentFolderName: extractParentFolderName(message),
      explicitContent: extractExplicitCodeContent(message),
      confidence: 0.9,
    };
  }

  if (hasRenameVerb && hasNamedTarget) {
    return {
      action: "rename_file",
      fileNames,
      folderNames,
      parentFolderName: extractParentFolderName(message),
      explicitContent: extractExplicitCodeContent(message),
      confidence: 0.9,
    };
  }

  if (isCreateApp) {
    const inferredFromQuotes = quotedValues
      .filter((value) => !value.includes("."))
      .map((value) => sanitizeAppName(value))
      .filter((value): value is string => Boolean(value));
    const inferredFromPhrase = extractAppNames(message);

    const inferredFolders =
      folderNames.length > 0
        ? folderNames
        : [...new Set([...inferredFromPhrase, ...inferredFromQuotes])];

    return {
      action: "create_app",
      folderNames: inferredFolders,
      fileNames,
      parentFolderName: extractParentFolderName(message),
      explicitContent: extractExplicitCodeContent(message),
      confidence: 0.9,
    };
  }

  if (isCreateFolder) {
    return {
      action: "create_folder",
      folderNames,
      fileNames,
      parentFolderName: extractParentFolderName(message),
      explicitContent: extractExplicitCodeContent(message),
      confidence: 0.8,
    };
  }

  if (isLikelyEditInExistingFile) {
    return {
      action: "update_file",
      fileNames,
      folderNames,
      parentFolderName: extractParentFolderName(message),
      explicitContent: extractExplicitCodeContent(message),
      confidence: 0.85,
    };
  }

  if (isCreateFile) {
    return {
      action: "create_file",
      fileNames,
      folderNames,
      parentFolderName: extractParentFolderName(message),
      explicitContent: extractExplicitCodeContent(message),
      confidence: 0.8,
    };
  }

  if (isUpdate) {
    return {
      action: "update_file",
      fileNames,
      folderNames,
      parentFolderName: extractParentFolderName(message),
      explicitContent: extractExplicitCodeContent(message),
      confidence: 0.8,
    };
  }

  if (isRead) {
    return {
      action: "read_file",
      fileNames,
      folderNames,
      parentFolderName: extractParentFolderName(message),
      explicitContent: extractExplicitCodeContent(message),
      confidence: 0.8,
    };
  }

  if (isList) {
    return {
      action: "list_files",
      fileNames,
      folderNames,
      parentFolderName: extractParentFolderName(message),
      explicitContent: extractExplicitCodeContent(message),
      confidence: 0.7,
    };
  }

  return {
    action: "unknown",
    fileNames,
    folderNames,
    parentFolderName: extractParentFolderName(message),
    explicitContent: extractExplicitCodeContent(message),
    confidence: 0.3,
  };
};

export const routeIntent = async ({
  message,
}: RouteIntentParams): Promise<IntentRoute> => {
  const heuristic = heuristicRoute(message);
  if (
    heuristic.action === "create_app" ||
    heuristic.action === "delete_file" ||
    heuristic.action === "rename_file"
  ) {
    return heuristic;
  }

  const ollama = createOpenAI({
    baseURL: process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434/v1",
    apiKey: process.env.OLLAMA_API_KEY ?? "ollama",
  });

  const model = process.env.CONVERSATION_MODEL ?? process.env.SUGGESTION_MODEL ?? "qwen2.5-coder:7b";

  try {
    const { object } = await generateObject({
      model: ollama(model),
      schema: routeSchema,
      prompt: [
        "Classify this coding-assistant message into one action.",
        "Return strict JSON that matches schema.",
        "Prefer: create_app, create_file, create_folder, update_file, read_file, list_files, delete_file, rename_file, unknown.",
        "If user asks to create/build/scaffold an app/project (React, Vite, Next.js), classify as create_app.",
        "If user asks to delete/remove a file/folder, classify as delete_file.",
        "If user asks to rename a file/folder, classify as rename_file.",
        "Important: If user says create/make function/program INSIDE an existing file (e.g. in test.py), classify as update_file, not create_file.",
        `Message: ${message}`,
      ].join("\n"),
    });

    if (object.action === "unknown" && heuristic.action !== "unknown") {
      return heuristic;
    }

    return object;
  } catch {
    return heuristic;
  }
};
