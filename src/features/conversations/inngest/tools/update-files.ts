import { z } from "zod";
import { createTool } from "@inngest/agent-kit";

import { convex } from "@/lib/convex-client";

import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";

interface UpdateFileToolOptions {
  internalKey: string;
  projectId: Id<"projects">;
}

const paramsSchema = z.object({
  fileId: z.string().min(1, "File ID is required").optional(),
  fileName: z.string().min(1, "File name is required").optional(),
  content: z.string(),
}).refine((v) => Boolean(v.fileId || v.fileName), {
  message: "Provide either fileId or fileName",
});

export const createUpdateFileTool = ({
  internalKey,
  projectId,
}: UpdateFileToolOptions) => {
  return createTool({
    name: "updateFile",
    description: "Update the content of an existing file",
    parameters: z.object({
      fileId: z.string().optional().describe("The ID of the file to update"),
      fileName: z.string().optional().describe("The file name/path to update (e.g. index.py)"),
      content: z.string().describe("The new content for the file"),
    }),
    handler: async (params, { step: toolStep }) => {
      const parsed = paramsSchema.safeParse(params);
      if (!parsed.success) {
        return `Error: ${parsed.error.issues[0].message}`;
      }

      const { fileId, fileName, content } = parsed.data;

      let file:
        | {
            _id: Id<"files">;
            name: string;
            type: "file" | "folder";
          }
        | null = null;

      if (fileId) {
        file = await convex.query(api.system.getFileById, {
          internalKey,
          fileId: fileId as Id<"files">,
        });
      } else if (fileName) {
        const allFiles = await convex.query(api.system.getProjectFiles, {
          internalKey,
          projectId,
        });
        const normalizedFileName = fileName.toLowerCase().trim();
        file =
          allFiles.find(
            (f) =>
              f.type === "file" &&
              (f.name.toLowerCase() === normalizedFileName ||
                f.name.toLowerCase().endsWith(`/${normalizedFileName}`))
          ) ?? null;
      }


      if (!file) {
        if (fileId) {
          return `Error: File with ID "${fileId}" not found. Use listFiles to get valid file IDs.`;
        }
        return `Error: File "${fileName}" not found. Use listFiles to get valid names.`;
      }

      if (file.type === "folder") {
        return `Error: "${fileId ?? fileName}" is a folder, not a file. You can only update file contents.`;
      }

      try {
        const runUpdate = async () => {
          await convex.mutation(api.system.updateFile, {
            internalKey,
            fileId: file._id,
            content,
          });

          return `File "${file.name}" updated successfully`;
        };

        if (toolStep) {
          return await toolStep.run("update-file", runUpdate);
        }

        return await runUpdate();
      } catch (error) {
        return `Error updating file: ${error instanceof Error ? error.message : "Unknown error"}`;
      }
    }
  });
};
