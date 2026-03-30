import { z } from "zod";
import { createTool } from "@inngest/agent-kit";

import { convex } from "@/lib/convex-client";

import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";

interface CreateFolderToolOptions {
  projectId: Id<"projects">;
  internalKey: string;
}

const paramsSchema = z.object({
  name: z.string().min(1, "Folder name is required"),
  parentId: z.string().optional().nullable(),
});

export const createCreateFolderTool = ({
  projectId,
  internalKey,
}: CreateFolderToolOptions) => {
  return createTool({
    name: "createFolder",
    description: "Create a new folder in the project",
    parameters: z.object({
      name: z.string().describe("The name of the folder to create"),
      parentId: z
        .string()
        .optional()
        .nullable()
        .describe(
          "The ID (not name!) of the parent folder from listFiles, or empty string for root level"
        ),
    }),
    handler: async (params, { step: toolStep }) => {
      const parsed = paramsSchema.safeParse(params);
      if (!parsed.success) {
        return `Error: ${parsed.error.issues[0].message}`;
      }

      const { name } = parsed.data;
      const parentIdInput = parsed.data.parentId ?? "";

      try {
        const runCreateFolder = async () => {
          // Validate parentId if provided
          if (parentIdInput && parentIdInput.trim() !== "") {
            try {
              const parentFolder = await convex.query(api.system.getFileById, {
                internalKey,
                fileId: parentIdInput as Id<"files">,
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
          }

          const folderId = await convex.mutation(api.system.createFolder, {
            internalKey,
            projectId,
            name,
            parentId:
              parentIdInput && parentIdInput.trim() !== ""
                ? (parentIdInput as Id<"files">)
                : undefined,
          });

          return `Folder "${name}" created successfully (id: ${folderId}).`;
        };

        if (toolStep) {
          return await toolStep.run("create-folder", runCreateFolder);
        }

        return await runCreateFolder();
      } catch (error) {
        return `Error creating folder: ${error instanceof Error ? error.message : "Unknown error"}`;
      }
    }
  });
};
