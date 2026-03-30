import { generateObject } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";

import { convex } from "@/lib/convex-client";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";

type Framework = "react_vite" | "nextjs";

interface PlanAndCreateAppParams {
  internalKey: string;
  projectId: Id<"projects">;
  message: string;
  preferredRootFolder?: string;
  parentId?: Id<"files">;
}

interface PlanAndCreateAppResult {
  framework: Framework;
  rootFolder: string;
  createdFiles: number;
  updatedFiles: number;
  createdFolders: number;
  summary: string;
  runInstructions: string[];
}

type ProjectItem = {
  _id: Id<"files">;
  name: string;
  type: "file" | "folder";
  parentId?: Id<"files"> | null;
};

type BlueprintFile = {
  path: string;
  content: string;
};

const reactContentSchema = z.object({
  summary: z.string().min(1),
  appTitle: z.string().min(1),
  appDescription: z.string().min(1),
  appJsx: z.string().min(1),
  appCss: z.string().min(1),
  indexCss: z.string().min(1),
});

const nextContentSchema = z.object({
  summary: z.string().min(1),
  appTitle: z.string().min(1),
  appDescription: z.string().min(1),
  pageJsx: z.string().min(1),
  globalsCss: z.string().min(1),
  loadingJsx: z.string().min(1),
  errorJsx: z.string().min(1),
  notFoundJsx: z.string().min(1),
});

const normalizePath = (value: string) =>
  value
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/")
    .trim();

const sanitizeSegment = (segment: string) =>
  segment
    .trim()
    .replace(/[<>:"|?*]/g, "")
    .replace(/\s+/g, "-");

const sanitizeRootFolder = (value: string) =>
  sanitizeSegment(value).replace(/^-+|-+$/g, "").toLowerCase();

const detectFramework = (message: string): Framework => {
  const lower = message.toLowerCase();
  if (/\bnext(?:\.js|js)?\b/.test(lower)) {
    return "nextjs";
  }
  return "react_vite";
};

const inferRootFolder = (message: string, framework: Framework) => {
  const named = message.match(/\b(?:called|named)\s+["'`]?([a-zA-Z0-9_-]{2,})["'`]?/i);
  if (named?.[1]) return sanitizeRootFolder(named[1]);

  return framework === "nextjs" ? "my-next-app" : "my-app";
};

const resolveFullPathMap = (items: ProjectItem[]) => {
  const byId = new Map<Id<"files">, ProjectItem>();
  for (const item of items) byId.set(item._id, item);

  const cache = new Map<Id<"files">, string>();
  const fullPath = (id: Id<"files">): string => {
    if (cache.has(id)) return cache.get(id)!;
    const item = byId.get(id);
    if (!item) return "";

    const own = item.name.trim();
    const parent = item.parentId ? fullPath(item.parentId) : "";
    const resolved = parent ? `${parent}/${own}` : own;
    cache.set(id, resolved);
    return resolved;
  };

  const foldersByPath = new Map<string, Id<"files">>();
  const filesByPath = new Map<string, ProjectItem>();

  for (const item of items) {
    const path = normalizePath(fullPath(item._id)).toLowerCase();
    if (!path) continue;
    if (item.type === "folder") {
      foldersByPath.set(path, item._id);
    } else {
      filesByPath.set(path, item);
    }
  }

  return { foldersByPath, filesByPath };
};

const buildReactPrompt = (message: string) =>
  [
    "Generate content for a React + Vite app using this strict file set:",
    "src/App.jsx, src/App.css, src/index.css",
    "Rules:",
    "- Return JSON only matching schema.",
    "- No markdown fences.",
    "- App.jsx must export default function App().",
    "- Keep code clean and runnable.",
    "- Build UI according to user intent (landing page/portfolio/dashboard/etc).",
    `User request: ${message}`,
  ].join("\n");

const buildNextPrompt = (message: string) =>
  [
    "Generate content for a Next.js App Router app using this strict file set:",
    "src/app/page.jsx, src/app/globals.css, src/app/loading.jsx, src/app/error.jsx, src/app/not-found.jsx",
    "Rules:",
    "- Return JSON only matching schema.",
    "- No markdown fences.",
    "- page.jsx must be a valid default-exported component.",
    "- error.jsx must be a client component using 'use client'.",
    "- Build UI according to user intent (landing page/portfolio/dashboard/etc).",
    `User request: ${message}`,
  ].join("\n");

const buildReactBlueprint = ({
  rootFolder,
  content,
}: {
  rootFolder: string;
  content: z.infer<typeof reactContentSchema>;
}): BlueprintFile[] => {
  const packageName =
    rootFolder.replace(/[^a-z0-9-_]/g, "-").replace(/^-+|-+$/g, "") ||
    "my-app";

  return [
    { path: `${rootFolder}/public/vite.svg`, content: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 410 404"><path fill="#41D1FF" d="M399.641 59.524L215.643 388.545a17.97 17.97 0 01-31.286.047L10.359 59.524A18 18 0 0128.49 33.05h352.98a18 18 0 0118.171 26.474z"/></svg>` },
    { path: `${rootFolder}/src/assets/react.svg`, content: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-11.5 -10.23174 23 20.46348"><circle cx="0" cy="0" r="2.05" fill="#61dafb"/><g stroke="#61dafb" stroke-width="1" fill="none"><ellipse rx="11" ry="4.2"/><ellipse rx="11" ry="4.2" transform="rotate(60)"/><ellipse rx="11" ry="4.2" transform="rotate(120)"/></g></svg>` },
    { path: `${rootFolder}/src/App.jsx`, content: content.appJsx },
    { path: `${rootFolder}/src/App.css`, content: content.appCss },
    { path: `${rootFolder}/src/main.jsx`, content: `import React from "react";\nimport ReactDOM from "react-dom/client";\nimport App from "./App.jsx";\nimport "./index.css";\n\nReactDOM.createRoot(document.getElementById("root")).render(\n  <React.StrictMode>\n    <App />\n  </React.StrictMode>\n);` },
    { path: `${rootFolder}/src/index.css`, content: content.indexCss },
    { path: `${rootFolder}/.gitignore`, content: `node_modules\ndist\n.DS_Store\n.vscode/*\n!.vscode/extensions.json` },
    { path: `${rootFolder}/index.html`, content: `<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>${content.appTitle}</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.jsx"></script>\n  </body>\n</html>` },
    { path: `${rootFolder}/package.json`, content: `{\n  "name": "${packageName}",\n  "private": true,\n  "version": "0.0.0",\n  "type": "module",\n  "scripts": {\n    "dev": "vite",\n    "build": "vite build",\n    "preview": "vite preview"\n  },\n  "dependencies": {\n    "react": "^19.2.0",\n    "react-dom": "^19.2.0"\n  },\n  "devDependencies": {\n    "@vitejs/plugin-react": "^5.0.0",\n    "vite": "^7.0.0"\n  }\n}` },
    { path: `${rootFolder}/vite.config.js`, content: `import { defineConfig } from "vite";\nimport react from "@vitejs/plugin-react";\n\nexport default defineConfig({\n  plugins: [react()],\n});` },
    { path: `${rootFolder}/README.md`, content: `# ${content.appTitle}\n\n${content.appDescription}\n\n## Run\n\n\`\`\`bash\ncd ${rootFolder}\nnpm install\nnpm run dev\n\`\`\`\n` },
  ];
};

const buildNextBlueprint = ({
  rootFolder,
  content,
}: {
  rootFolder: string;
  content: z.infer<typeof nextContentSchema>;
}): BlueprintFile[] => {
  const packageName =
    rootFolder.replace(/[^a-z0-9-_]/g, "-").replace(/^-+|-+$/g, "") ||
    "my-next-app";

  return [
    { path: `${rootFolder}/public/favicon.ico`, content: "" },
    { path: `${rootFolder}/public/images/.gitkeep`, content: "" },
    { path: `${rootFolder}/src/app/layout.jsx`, content: `import "./globals.css";\n\nexport const metadata = {\n  title: "${content.appTitle}",\n  description: "${content.appDescription}",\n};\n\nexport default function RootLayout({ children }) {\n  return (\n    <html lang="en">\n      <body>{children}</body>\n    </html>\n  );\n}` },
    { path: `${rootFolder}/src/app/page.jsx`, content: content.pageJsx },
    { path: `${rootFolder}/src/app/globals.css`, content: content.globalsCss },
    { path: `${rootFolder}/src/app/loading.jsx`, content: content.loadingJsx },
    { path: `${rootFolder}/src/app/error.jsx`, content: content.errorJsx },
    { path: `${rootFolder}/src/app/not-found.jsx`, content: content.notFoundJsx },
    { path: `${rootFolder}/.env.local`, content: `# Add local environment variables here\n` },
    { path: `${rootFolder}/.gitignore`, content: `node_modules\n.next\nout\ndist\n.env*.local\n.DS_Store\n.vscode/*\n!.vscode/extensions.json` },
    { path: `${rootFolder}/next.config.js`, content: `/** @type {import('next').NextConfig} */\nconst nextConfig = {};\n\nmodule.exports = nextConfig;` },
    { path: `${rootFolder}/package.json`, content: `{\n  "name": "${packageName}",\n  "private": true,\n  "version": "0.1.0",\n  "scripts": {\n    "dev": "next dev",\n    "build": "next build",\n    "start": "next start",\n    "lint": "next lint"\n  },\n  "dependencies": {\n    "next": "^16.0.0",\n    "react": "^19.2.0",\n    "react-dom": "^19.2.0"\n  }\n}` },
    { path: `${rootFolder}/README.md`, content: `# ${content.appTitle}\n\n${content.appDescription}\n\n## Run\n\n\`\`\`bash\ncd ${rootFolder}\nnpm install\nnpm run dev\n\`\`\`\n` },
  ];
};

const defaultReactFolders = [
  "public",
  "src",
  "src/assets",
  "src/components",
  "src/pages",
  "src/hooks",
  "src/utils",
];

const defaultNextFolders = [
  "public",
  "public/images",
  "src",
  "src/app",
  "src/components",
  "src/components/ui",
  "src/components/shared",
  "src/hooks",
  "src/lib",
  "src/services",
  "src/context",
  "src/store",
  "src/types",
  "src/constants",
];

export const planAndCreateApp = async ({
  internalKey,
  projectId,
  message,
  preferredRootFolder,
  parentId,
}: PlanAndCreateAppParams): Promise<PlanAndCreateAppResult> => {
  const framework = detectFramework(message);
  const rootFolder = sanitizeRootFolder(
    preferredRootFolder || inferRootFolder(message, framework)
  );

  if (!rootFolder) {
    throw new Error("Unable to determine app folder name.");
  }

  const allItems = await convex.query(api.system.getProjectFiles, {
    internalKey,
    projectId,
  });
  const { foldersByPath, filesByPath } = resolveFullPathMap(allItems);

  const ollama = createOpenAI({
    baseURL: process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434/v1",
    apiKey: process.env.OLLAMA_API_KEY ?? "ollama",
  });
  const model =
    process.env.CONVERSATION_MODEL ??
    process.env.SUGGESTION_MODEL ??
    "qwen2.5-coder:7b";

  let summary = "";
  let blueprintFiles: BlueprintFile[] = [];
  let requiredFolders: string[] = [];

  if (framework === "react_vite") {
    const { object } = await generateObject({
      model: ollama(model),
      schema: reactContentSchema,
      prompt: buildReactPrompt(message),
    });
    summary = object.summary.trim();
    blueprintFiles = buildReactBlueprint({ rootFolder, content: object });
    requiredFolders = defaultReactFolders.map((folder) => `${rootFolder}/${folder}`);
  } else {
    const { object } = await generateObject({
      model: ollama(model),
      schema: nextContentSchema,
      prompt: buildNextPrompt(message),
    });
    summary = object.summary.trim();
    blueprintFiles = buildNextBlueprint({ rootFolder, content: object });
    requiredFolders = defaultNextFolders.map((folder) => `${rootFolder}/${folder}`);
  }

  const folderCache = new Map<string, Id<"files">>(foldersByPath);
  let createdFolders = 0;

  const ensureFolderPath = async (
    folderPath: string
  ): Promise<Id<"files"> | undefined> => {
    const normalized = normalizePath(folderPath);
    if (!normalized) return parentId;

    const parts = normalized.split("/").filter(Boolean).map(sanitizeSegment);
    let currentPath = "";
    let currentParent = parentId;

    for (const part of parts) {
      currentPath = normalizePath(currentPath ? `${currentPath}/${part}` : part).toLowerCase();
      const existingId = folderCache.get(currentPath);
      if (existingId) {
        currentParent = existingId;
        continue;
      }

      const newId = await convex.mutation(api.system.createFolder, {
        internalKey,
        projectId,
        name: part,
        parentId: currentParent,
      });
      folderCache.set(currentPath, newId);
      currentParent = newId;
      createdFolders += 1;
    }

    return currentParent;
  };

  for (const folder of requiredFolders) {
    await ensureFolderPath(folder);
  }

  let createdFiles = 0;
  let updatedFiles = 0;

  for (const file of blueprintFiles) {
    const fullPath = normalizePath(file.path);
    if (!fullPath || fullPath.includes("..")) {
      continue;
    }

    const segments = fullPath.split("/").filter(Boolean);
    const fileName = sanitizeSegment(segments.at(-1) ?? "");
    if (!fileName) continue;

    const folderPath = segments.slice(0, -1).join("/");
    const parentFolderId = await ensureFolderPath(folderPath);
    const key = fullPath.toLowerCase();
    const existing = filesByPath.get(key);

    if (existing) {
      await convex.mutation(api.system.updateFile, {
        internalKey,
        fileId: existing._id,
        content: file.content,
      });
      updatedFiles += 1;
      continue;
    }

    const result = await convex.mutation(api.system.createFiles, {
      internalKey,
      projectId,
      parentId: parentFolderId,
      files: [{ name: fileName, content: file.content }],
    });

    if (!result[0]?.error) {
      createdFiles += 1;
    }
  }

  const runInstructions =
    framework === "react_vite"
      ? [`cd ${rootFolder}`, "npm install", "npm run dev"]
      : [`cd ${rootFolder}`, "npm install", "npm run dev"];

  return {
    framework,
    rootFolder,
    createdFiles,
    updatedFiles,
    createdFolders,
    summary,
    runInstructions,
  };
};
