import { useCallback, useEffect, useRef, useState } from "react";
import { WebContainer } from "@webcontainer/api";
import { Doc } from "../../../../convex/_generated/dataModel";

import { 
  buildFileTree,
  getFilePath
} from "@/features/preview/utils/file-tree";
import { useFilesWithStorageUrls } from "@/features/projects/hooks/use-files";

import { Id } from "../../../../convex/_generated/dataModel";

type PreviewFile = Doc<"files"> & {
  storageUrl: string | null;
};

type WebContainerState = {
  instance: WebContainer | null;
  bootPromise: Promise<WebContainer> | null;
};

const WEB_CONTAINER_STATE_KEY = "__neonscript_webcontainer_state__";

const getWebContainerState = (): WebContainerState => {
  const globalScope = globalThis as typeof globalThis & {
    [WEB_CONTAINER_STATE_KEY]?: WebContainerState;
  };

  if (!globalScope[WEB_CONTAINER_STATE_KEY]) {
    globalScope[WEB_CONTAINER_STATE_KEY] = {
      instance: null,
      bootPromise: null,
    };
  }

  return globalScope[WEB_CONTAINER_STATE_KEY];
};

const getWebContainer = async (): Promise<WebContainer> => {
  const state = getWebContainerState();

  if (state.instance) {
    return state.instance;
  }

  if (!state.bootPromise) {
    state.bootPromise = WebContainer.boot({ coep: "credentialless" })
      .then((instance) => {
        state.instance = instance;
        return instance;
      })
      .catch((error) => {
        state.bootPromise = null;
        throw error;
      });
  }

  return state.bootPromise;
};

const teardownWebContainer = () => {
  const state = getWebContainerState();

  if (state.instance) {
    state.instance.teardown();
    state.instance = null;
  }
  state.bootPromise = null;
};

interface UseWebContainerProps {
  projectId: Id<"projects">;
  enabled: boolean;
  settings?: {
    installCommand?: string;
    devCommand?: string;
  };
};

const inferWorkingDirectory = (
  projectFiles: PreviewFile[] | undefined
): string => {
  if (!projectFiles || projectFiles.length === 0) {
    return ".";
  }

  const filesMap = new Map(projectFiles.map((f) => [f._id, f]));
  const packageJsonCandidates = projectFiles
    .filter((f) => f.type === "file" && f.name === "package.json" && !f.storageId)
    .map((file) => getFilePath(file, filesMap))
    .sort((a, b) => a.split("/").length - b.split("/").length);

  if (packageJsonCandidates.length === 0) {
    return ".";
  }

  const selected = packageJsonCandidates[0];
  const parts = selected.split("/");
  parts.pop();
  return parts.length > 0 ? parts.join("/") : ".";
};

export const useWebContainer = ({
  projectId,
  enabled,
  settings,
}: UseWebContainerProps) => {
  const [status, setStatus] = useState<
    "idle" | "booting" | "installing" | "running" | "error"
  >("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restartKey, setRestartKey] = useState(0);
  const [terminalOutput, setTerminalOutput] = useState("");

  const containerRef = useRef<WebContainer | null>(null);
  const hasStartedRef = useRef(false);
  const binarySyncStateRef = useRef<Map<string, string>>(new Map());

  // Fetch files from Convex (auto-updates on changes)
  const files = useFilesWithStorageUrls(projectId);

  // Initial boot and mount
  useEffect(() => {
    if (!enabled || !files || files.length === 0 || hasStartedRef.current) {
      return;
    }

    hasStartedRef.current = true;

    const start = async () => {
      try {
        setStatus("booting");
        setError(null);
        setTerminalOutput("");

        const appendOutput = (data: string) => {
          setTerminalOutput((prev) => prev + data);
        };

        const container = await getWebContainer();
        containerRef.current = container;
        binarySyncStateRef.current = new Map();

        const fileTree = buildFileTree(files);
        await container.mount(fileTree);
        appendOutput("[webcontainer] Files mounted.\n");
        const workingDirectory = inferWorkingDirectory(files);
        appendOutput(`[webcontainer] Working directory: ${workingDirectory}\n`);

        const filesMap = new Map(files.map((f) => [f._id, f as Doc<"files">]));
        const binaryFiles = files.filter(
          (file): file is PreviewFile =>
            file.type === "file" && !!file.storageId && !!file.storageUrl
        );

        if (binaryFiles.length > 0) {
          appendOutput(
            `[webcontainer] Syncing ${binaryFiles.length} binary file(s)...\n`
          );
        }

        for (const file of binaryFiles) {
          const filePath = getFilePath(file, filesMap);
          const response = await fetch(file.storageUrl!);
          if (!response.ok) {
            throw new Error(`Failed to fetch binary file: ${file.name}`);
          }
          const buffer = new Uint8Array(await response.arrayBuffer());
          await container.fs.writeFile(filePath, buffer);
          binarySyncStateRef.current.set(file._id, file.storageId!);
        }

        container.on("server-ready", (port, url) => {
          appendOutput(`\n[server-ready] Port ${port} -> ${url}\n`);
          setPreviewUrl(url);
          setStatus("running");
        });

        setStatus("installing");

        // Parse install command (default: npm install)
        const installCmd = settings?.installCommand?.trim() || "npm install";
        const [installBin, ...installArgs] = installCmd.split(" ");
        appendOutput(`\n$ (${workingDirectory}) ${installCmd}\n`);
        const installProcess = await container.spawn(installBin, installArgs, {
          cwd: workingDirectory,
        });
        const installOutputDone = installProcess.output.pipeTo(
          new WritableStream({
            write(data) {
              appendOutput(data);
            },
          })
        );
        const installExitCode = await installProcess.exit;
        await installOutputDone.catch(() => undefined);

        if (installExitCode !== 0) {
          throw new Error(
            `${installCmd} failed with code ${installExitCode}`
          );
        }

        // Parse dev command (default: npm run dev)
        const devCmd = settings?.devCommand?.trim() || "npm run dev";
        const [devBin, ...devArgs] = devCmd.split(" ");
        appendOutput(`\n$ (${workingDirectory}) ${devCmd}\n`);
        appendOutput("[webcontainer] Waiting for server-ready event...\n");
        const devProcess = await container.spawn(devBin, devArgs, {
          cwd: workingDirectory,
        });
        devProcess.output.pipeTo(
          new WritableStream({
            write(data) {
              appendOutput(data);
            },
          })
        ).catch(() => undefined);
      } catch (error) {
        setError(error instanceof Error ? error.message : "Unknown error");
        setStatus("error");
      }
    };

    start();
  }, [
    enabled,
    files,
    restartKey,
    settings?.devCommand,
    settings?.installCommand,
  ]);

  // Sync file changes (hot-reload)
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !files || status !== "running") return;

    const filesMap = new Map(files.map((f) => [f._id, f as Doc<"files">]));

    for (const file of files) {
      if (file.type !== "file" || file.storageId || !file.content) continue;

      const filePath = getFilePath(file as Doc<"files">, filesMap);
      container.fs.writeFile(filePath, file.content);
    }
  }, [files, status]);

  // Sync binary file changes (or first-write after running)
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !files || status !== "running") return;

    const filesMap = new Map(files.map((f) => [f._id, f as Doc<"files">]));

    const syncBinaryFiles = async () => {
      for (const file of files) {
        if (file.type !== "file" || !file.storageId || !file.storageUrl) continue;

        const lastSyncedStorageId = binarySyncStateRef.current.get(file._id);
        if (lastSyncedStorageId === file.storageId) continue;

        const filePath = getFilePath(file as Doc<"files">, filesMap);
        const response = await fetch(file.storageUrl);
        if (!response.ok) continue;

        const buffer = new Uint8Array(await response.arrayBuffer());
        await container.fs.writeFile(filePath, buffer);
        binarySyncStateRef.current.set(file._id, file.storageId);
      }
    };

    syncBinaryFiles().catch(() => undefined);
  }, [files, status]);

  // Reset when disabled
  useEffect(() => {
    if (!enabled) {
      hasStartedRef.current = false;
      setStatus("idle");
      setPreviewUrl(null);
      setError(null);
    }
  }, [enabled]);

  // Restart the entire WebContainer process
  const restart = useCallback(() => {
    teardownWebContainer();
    containerRef.current = null;
    hasStartedRef.current = false;
    setStatus("idle");
    setPreviewUrl(null);
    setError(null);
    binarySyncStateRef.current = new Map();
    setRestartKey((k) => k + 1);
  }, []);

  return {
    status,
    previewUrl,
    error,
    restart,
    terminalOutput,
  };
};
