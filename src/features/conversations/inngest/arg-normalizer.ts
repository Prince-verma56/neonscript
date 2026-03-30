export const extractQuotedValues = (input: string): string[] => {
  const values = new Set<string>();
  const quotedRegex = /["'`][^"'`]+["'`]/g;

  for (const match of input.match(quotedRegex) ?? []) {
    const cleaned = match.slice(1, -1).trim();
    if (cleaned) {
      values.add(cleaned);
    }
  }

  return [...values];
};

export const extractFileNames = (input: string): string[] => {
  const names = new Set<string>();

  for (const value of extractQuotedValues(input)) {
    if (value.includes(".")) {
      names.add(value);
    }
  }

  const plainFileRegex = /\b[\w./-]+\.[a-zA-Z0-9]+\b/g;
  for (const match of input.match(plainFileRegex) ?? []) {
    names.add(match.trim());
  }

  return [...names];
};

export const extractFolderNames = (input: string): string[] => {
  const names = new Set<string>();

  for (const value of extractQuotedValues(input)) {
    if (!value.includes(".")) {
      names.add(value);
    }
  }

  const capture =
    /\b(?:create|make|generate|add)\b(?:\s+\w+){0,5}\s+\b(?:folder|directory)\b\s+([a-zA-Z0-9_-]+)/gi;
  for (const match of input.matchAll(capture)) {
    if (match[1]) {
      names.add(match[1].trim());
    }
  }

  return [...names];
};

export const extractParentFolderName = (input: string): string | undefined => {
  const quotedMatch = input.match(
    /\b(?:inside|into|under|in)\b(?:\s+the)?\s+(?:folder\s+)?["'`]([^"'`]+)["'`]/i
  );
  if (quotedMatch?.[1]) {
    return quotedMatch[1].trim();
  }

  const plainMatch = input.match(
    /\b(?:inside|into|under|in)\b(?:\s+the)?\s+(?:folder\s+)?([a-zA-Z0-9_-]+)/i
  );
  if (plainMatch?.[1]) {
    return plainMatch[1].trim();
  }

  return undefined;
};

export const extractExplicitCodeContent = (input: string): string | undefined => {
  const fenced = input.match(/```[a-zA-Z0-9]*\n([\s\S]*?)```/);
  if (fenced?.[1]?.trim()) {
    return fenced[1].trim();
  }

  const inline = input.match(/\b(?:put this content|use this content|replace with)\b\s*:?\s*([\s\S]+)/i);
  if (inline?.[1]?.trim()) {
    return inline[1].trim();
  }

  return undefined;
};
