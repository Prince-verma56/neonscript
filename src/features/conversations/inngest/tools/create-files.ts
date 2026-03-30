import { z } from "zod";
import { createTool } from "@inngest/agent-kit";

import { convex } from "@/lib/convex-client";

import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";

interface CreateFilesToolOptions {
  projectId: Id<"projects">;
  internalKey: string;
}

const paramsSchema = z.object({
  parentId: z.string().optional().nullable(),
  parentName: z.string().optional().nullable(),
  files: z
    .array(
      z.union([
        z.object({
          name: z.string().min(1, "File name cannot be empty"),
          content: z.string(),
        }),
        z.string().min(1, "File name cannot be empty"),
      ])
    )
    .min(1, "Provide at least one file to create"),
});

export const createCreateFilesTool = ({
  projectId,
  internalKey,
}: CreateFilesToolOptions) => {
  return createTool({
    name: "createFiles",
    description:
      "Create multiple files at once in the same folder. Use this to batch create files that share the same parent folder. More efficient than creating files one by one.",
    parameters: z.object({
      parentId: z
        .string()
        .optional()
        .nullable()
        .describe(
          "Optional parent folder ID. Use empty string or null for root level."
        ),
      parentName: z
        .string()
        .optional()
        .nullable()
        .describe("Optional parent folder name if parentId is not available."),
      files: z
        .array(
          z.union([
            z.object({
              name: z.string().describe("The file name including extension"),
              content: z.string().describe("The file content"),
            }),
            z.string().describe("A file name to create with empty content"),
          ])
        )
        .describe("Array of files to create"),
    }),
    handler: async (params, { step: toolStep }) => {
      const parsed = paramsSchema.safeParse(params);
      if (!parsed.success) {
        return `Error: ${parsed.error.issues[0].message}`;
      }

      const parentIdInput = parsed.data.parentId ?? "";
      const parentNameInput = parsed.data.parentName ?? "";
      const files = parsed.data.files.map((file) =>
        typeof file === "string"
          ? { name: file, content: "" }
          : file
      );

      try {
        const runCreateFiles = async () => {
          let resolvedParentId: Id<"files"> | undefined;

          if (parentIdInput && parentIdInput.trim() !== "") {
            try {
              resolvedParentId = parentIdInput as Id<"files">;
              const parentFolder = await convex.query(api.system.getFileById, {
                internalKey,
                fileId: resolvedParentId,
              });
              if (!parentFolder) {
                return `Error: Parent folder with ID "${parentIdInput}" not found. Use listFiles to get valid folder IDs.`;
              }
              if (parentFolder.type !== "folder") {
                return `Error: The ID "${parentIdInput}" is a file, not a folder. Use a folder ID as parentId.`;
              }
            } catch {
              return `Error: Invalid parentId "${parentIdInput}". Use listFiles to get valid folder IDs, or use empty string for root level.`;
            }
          } else if (parentNameInput && parentNameInput.trim() !== "") {
            const allFiles = await convex.query(api.system.getProjectFiles, {
              internalKey,
              projectId,
            });

            const normalizedParentName = parentNameInput.toLowerCase().trim();
            const matchedFolder = allFiles.find(
              (f) =>
                f.type === "folder" &&
                (f.name.toLowerCase() === normalizedParentName ||
                  f.name.toLowerCase().endsWith(`/${normalizedParentName}`))
            );

            if (!matchedFolder) {
              return `Error: Parent folder "${parentNameInput}" not found. Use listFiles to get valid folder names.`;
            }

            resolvedParentId = matchedFolder._id;
          }

          const results = await convex.mutation(api.system.createFiles, {
            internalKey,
            projectId,
            parentId: resolvedParentId,
            files,
          });

          const created = results.filter((r) => !r.error);
          const failed = results.filter((r) => r.error);

          let response = `Created ${created.length} file(s)`;
          if (created.length > 0) {
            response += `: ${created.map((r) => r.name).join(", ")}`;
          }
          if (failed.length > 0) {
            response += `. Failed: ${failed.map((r) => `${r.name} (${r.error})`).join(", ")}`;
          }

          return response;
        };

        if (toolStep) {
          return await toolStep.run("create-files", runCreateFiles);
        }

        return await runCreateFiles();
      } catch (error) {
        return `Error creating files: ${error instanceof Error ? error.message : "Unknown error"}`;
      }
    }
  });
};
