import { z } from "zod";
import { createTool } from "@inngest/agent-kit";

import { convex } from "@/lib/convex-client";

import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";

interface DeleteFilesToolOptions {
  internalKey: string;
  projectId: Id<"projects">;
}

const paramsSchema = z.object({
  fileIds: z.array(z.string().min(1)).optional(),
  fileNames: z.array(z.string().min(1)).optional(),
  targets: z.array(z.string().min(1)).optional(),
}).refine(
  (v) =>
    Boolean(
      (v.fileIds && v.fileIds.length > 0) ||
        (v.fileNames && v.fileNames.length > 0) ||
        (v.targets && v.targets.length > 0)
    ),
  {
    message: "Provide fileIds or fileNames/targets",
  }
);

export const createDeleteFilesTool = ({
  internalKey,
  projectId,
}: DeleteFilesToolOptions) => {
  return createTool({
    name: "deleteFiles",
    description:
      "Delete files or folders from the project. If deleting a folder, all contents will be deleted recursively.",
    parameters: z.object({
      fileIds: z
        .array(z.string())
        .optional()
        .describe("Array of file or folder IDs to delete"),
      fileNames: z
        .array(z.string())
        .optional()
        .describe("Array of file/folder names to delete"),
      targets: z
        .array(z.string())
        .optional()
        .describe("Alias for fileNames"),
    }),
    handler: async (params, { step: toolStep }) => {
      const parsed = paramsSchema.safeParse(params);
      if (!parsed.success) {
        return `Error: ${parsed.error.issues[0].message}`;
      }

      const fileIds = parsed.data.fileIds ?? [];
      const fileNames = [...(parsed.data.fileNames ?? []), ...(parsed.data.targets ?? [])];

      // Validate all files exist before running the step
      const filesToDelete: {
        id: string;
        name: string;
        type: string
      }[] = [];

      const allFiles = await convex.query(api.system.getProjectFiles, {
        internalKey,
        projectId,
      });

      for (const fileId of fileIds) {
        const file = await convex.query(api.system.getFileById, {
          internalKey,
          fileId: fileId as Id<"files">,
        });

        if (!file) {
          return `Error: File with ID "${fileId}" not found. Use listFiles to get valid file IDs.`;
        }

        filesToDelete.push({
          id: file._id,
          name: file.name,
          type: file.type,
        });
      }

      for (const fileName of fileNames) {
        const normalized = fileName.toLowerCase().trim();
        const file = allFiles.find(
          (f) =>
            f.name.toLowerCase() === normalized ||
            f.name.toLowerCase().endsWith(`/${normalized}`)
        );

        if (!file) {
          return `Error: File "${fileName}" not found. Use listFiles to get valid names.`;
        }

        const exists = filesToDelete.some((f) => f.id === file._id);
        if (!exists) {
          filesToDelete.push({
            id: file._id,
            name: file.name,
            type: file.type,
          });
        }
      }

      try {
        const runDelete = async () => {
          const results: string[] = [];

          for (const file of filesToDelete) {
            await convex.mutation(api.system.deleteFile, {
              internalKey,
              fileId: file.id as Id<"files">,
            });

            results.push(`Deleted ${file.type} "${file.name}" successfully`);
          }

          return results.join("\n");
        };

        if (toolStep) {
          return await toolStep.run("delete-files", runDelete);
        }

        return await runDelete();
      } catch (error) {
        return `Error deleting files: ${error instanceof Error ? error.message : "Unknown error"}`;
      }
    }
  });
};
