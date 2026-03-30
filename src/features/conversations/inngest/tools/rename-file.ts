import { z } from "zod";
import { createTool } from "@inngest/agent-kit";

import { convex } from "@/lib/convex-client";

import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";

interface RenameFileToolOptions {
  internalKey: string;
  projectId: Id<"projects">;
}

const paramsSchema = z.object({
  fileId: z.string().min(1, "File ID is required").optional(),
  fileName: z.string().min(1, "File name is required").optional(),
  path: z.string().min(1, "Path cannot be empty").optional(),
  target: z.string().min(1, "Target cannot be empty").optional(),
  newName: z.string().min(1, "New name is required").optional(),
  to: z.string().min(1, "New name is required").optional(),
  new_name: z.string().min(1, "New name is required").optional(),
}).refine((v) => Boolean(v.fileId || v.fileName || v.path || v.target), {
  message: "Provide fileId or fileName/path/target",
}).refine((v) => Boolean(v.newName || v.to || v.new_name), {
  message: "Provide newName",
});

export const createRenameFileTool = ({
  internalKey,
  projectId,
}: RenameFileToolOptions) => {
  return createTool({
    name: "renameFile",
    description: "Rename a file or folder",
    parameters: z.object({
      fileId: z.string().optional().describe("ID of file/folder to rename"),
      fileName: z.string().optional().describe("Current file/folder name"),
      path: z.string().optional().describe("Current file/folder path"),
      target: z.string().optional().describe("Alias for current file/folder name/path"),
      newName: z.string().optional().describe("New name for file/folder"),
      to: z.string().optional().describe("Alias for newName"),
      new_name: z.string().optional().describe("Alias for newName"),
    }),
    handler: async (params, { step: toolStep }) => {
      const parsed = paramsSchema.safeParse(params);
      if (!parsed.success) {
        return `Error: ${parsed.error.issues[0].message}`;
      }

      const lookup = parsed.data.fileId
        ? { kind: "id" as const, value: parsed.data.fileId }
        : {
            kind: "name" as const,
            value:
              parsed.data.fileName ??
              parsed.data.path ??
              parsed.data.target ??
              "",
          };
      const newName =
        parsed.data.newName ?? parsed.data.to ?? parsed.data.new_name ?? "";

      let file:
        | {
            _id: Id<"files">;
            name: string;
            type: "file" | "folder";
          }
        | null = null;

      if (lookup.kind === "id") {
        file = await convex.query(api.system.getFileById, {
          internalKey,
          fileId: lookup.value as Id<"files">,
        });
      } else {
        const allFiles = await convex.query(api.system.getProjectFiles, {
          internalKey,
          projectId,
        });
        const normalized = lookup.value.toLowerCase().trim();
        file =
          allFiles.find(
            (f) =>
              f.name.toLowerCase() === normalized ||
              f.name.toLowerCase().endsWith(`/${normalized}`)
          ) ?? null;
      }

      if (!file) {
        if (lookup.kind === "id") {
          return `Error: File with ID "${lookup.value}" not found. Use listFiles to get valid file IDs.`;
        }
        return `Error: File "${lookup.value}" not found. Use listFiles to get valid names.`;
      }

      try {
        const runRename = async () => {
          await convex.mutation(api.system.renameFile, {
            internalKey,
            fileId: file._id,
            newName,
          });

          return `Renamed "${file.name}" to "${newName}" successfully`;
        };

        if (toolStep) {
          return await toolStep.run("rename-file", runRename);
        }

        return await runRename();
      } catch (error) {
        return `Error renaming file: ${error instanceof Error ? error.message : "Unknown error"}`;
      }
    }
  });
};
