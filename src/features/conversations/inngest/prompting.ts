export interface PromptIntent {
  requiresFileListToolCall: boolean;
  requiresFileContentToolCall: boolean;
  requiresFileEditToolCall: boolean;
  requiresFileToolCall: boolean;
}

const FILE_QUERY_REGEX =
  /\b(what files|which files|list files|show files|project files|find files|find my files|files in project|files do i have|folder structure|project structure|directory|tree|files?)\b/i;
const FILE_CONTENT_QUERY_REGEX =
  /\b(show|read|open|display|print|give|tell)\b.*\b(code|content|inside|in)\b|\b(code|content)\b.*\b(of|inside|from|in)\b/i;
const FILE_EDIT_QUERY_REGEX =
  /\b(update|modify|change|edit|rewrite|replace|add|append|insert|fix)\b/i;

export const detectPromptIntent = (message: string): PromptIntent => {
  const requestedFileNames = extractRequestedFileNames(message);
  const requiresFileListToolCall = FILE_QUERY_REGEX.test(message);
  const requiresFileContentToolCall = FILE_CONTENT_QUERY_REGEX.test(message);
  const requiresFileEditToolCall =
    FILE_EDIT_QUERY_REGEX.test(message) && requestedFileNames.length > 0;

  return {
    requiresFileListToolCall,
    requiresFileContentToolCall,
    requiresFileEditToolCall,
    requiresFileToolCall:
      requiresFileListToolCall ||
      requiresFileContentToolCall ||
      requiresFileEditToolCall,
  };
};

export const extractRequestedFileNames = (input: string): string[] => {
  const names = new Set<string>();

  const quotedRegex = /["'`][^"'`]+["'`]/g;
  for (const match of input.match(quotedRegex) ?? []) {
    const cleaned = match.slice(1, -1).trim();
    if (cleaned.includes(".")) {
      names.add(cleaned);
    }
  }

  const plainFileRegex = /\b[\w.-]+\.[a-zA-Z0-9]+\b/g;
  for (const match of input.match(plainFileRegex) ?? []) {
    names.add(match.trim());
  }

  return [...names];
};

export const extensionToLanguage = (fileName: string): string => {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "ts",
    tsx: "tsx",
    js: "js",
    jsx: "jsx",
    py: "python",
    html: "html",
    css: "css",
    json: "json",
    md: "md",
    txt: "text",
  };
  return map[ext] ?? "text";
};

interface BuildPromptOptions {
  basePrompt: string;
  historyText?: string;
  intent: PromptIntent;
}

export const buildCodingAgentPrompt = ({
  basePrompt,
  historyText,
  intent,
}: BuildPromptOptions): string => {
  let prompt = basePrompt;

  if (historyText) {
    prompt += `\n\n## Previous Conversation (for context only - do NOT repeat these responses):\n${historyText}\n\n## Current Request:\nRespond ONLY to the user's new message below.`;
  }

  prompt +=
    "\n\n## Available Tools\nYou can only use these tools: listFiles, readFiles, updateFile.";
  prompt +=
    "\n- `listFiles`: list all files/folders and their IDs\n- `readFiles`: read existing file content by IDs\n- `updateFile`: update content of one existing file by ID";

  prompt +=
    "\n\n## Tool Rules\n- Never output raw tool-call JSON in your final answer.\n- For file list questions, call `listFiles` before answering.\n- For file content questions, call `listFiles` then `readFiles`.\n- For file edit requests, call `listFiles` -> `readFiles` -> `updateFile`.\n- Do not say a file was updated unless `updateFile` succeeded.";

  prompt +=
    "\n\n## Response Style\n- Keep responses simple and useful.\n- When listing files, do not show internal IDs unless the user explicitly asks for technical metadata.\n- When user asks for file code/content, return actual content from tools in a code block.";

  if (intent.requiresFileToolCall) {
    prompt +=
      "\n\n## Mandatory This Turn\nThis message requires tool use. Do not answer from memory. Use the tools first.";
  }

  return prompt;
};
