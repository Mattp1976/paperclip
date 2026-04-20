import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { workspaceFilesApi, type WorkspaceFileEntry } from "../api/agents";
import { cn } from "../lib/utils";
import {
  FileText,
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  File,
  ArrowLeft,
  Download,
  Clock,
} from "lucide-react";

/* ── Helpers ─────────────────────────────────────────────────────── */

function humanSize(bytes: number): string {
  if (bytes === 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function relativeTime(iso: string): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const EXT_ICONS: Record<string, string> = {
  md: "📄",
  txt: "📝",
  csv: "📊",
  json: "📋",
  pdf: "📕",
  py: "🐍",
  ts: "🔷",
  tsx: "🔷",
  js: "🟡",
  jsx: "🟡",
  html: "🌐",
  css: "🎨",
  sql: "🗃️",
};

function fileIcon(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return EXT_ICONS[ext] ?? "📄";
}

function isRenderable(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return ["md", "txt", "csv", "json", "html", "css", "js", "jsx", "ts", "tsx", "py", "sql", "yaml", "yml", "toml", "xml", "sh", "bash", "log"].includes(ext);
}

/* ── Tree helpers ─────────────────────────────────────────────────── */

interface TreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modified: string;
  children: TreeNode[];
}

function buildTree(files: WorkspaceFileEntry[]): TreeNode[] {
  const root: TreeNode[] = [];
  const dirMap = new Map<string, TreeNode>();

  // Sort: directories first, then alphabetical
  const sorted = [...files].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.path.localeCompare(b.path);
  });

  for (const file of sorted) {
    const parts = file.path.split("/");
    const node: TreeNode = {
      name: file.name,
      path: file.path,
      isDirectory: file.isDirectory,
      size: file.size,
      modified: file.modified,
      children: [],
    };

    if (file.isDirectory) {
      dirMap.set(file.path, node);
    }

    if (parts.length === 1) {
      root.push(node);
    } else {
      const parentPath = parts.slice(0, -1).join("/");
      const parent = dirMap.get(parentPath);
      if (parent) {
        parent.children.push(node);
      } else {
        root.push(node);
      }
    }
  }

  return root;
}

/* ── File Tree Item ──────────────────────────────────────────────── */

function FileTreeItem({
  node,
  depth,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  onSelect: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth === 0);

  if (node.isDirectory) {
    return (
      <div>
        <button
          className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted/50 rounded-md transition-colors"
          style={{ paddingLeft: `${12 + depth * 16}px` }}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          )}
          {expanded ? (
            <FolderOpen className="h-4 w-4 text-amber-500 flex-shrink-0" />
          ) : (
            <Folder className="h-4 w-4 text-amber-500 flex-shrink-0" />
          )}
          <span className="text-foreground font-medium truncate">{node.name}</span>
        </button>
        {expanded && node.children.length > 0 && (
          <div>
            {node.children.map((child) => (
              <FileTreeItem
                key={child.path}
                node={child}
                depth={depth + 1}
                onSelect={onSelect}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted/50 rounded-md transition-colors group"
      style={{ paddingLeft: `${12 + depth * 16 + 20}px` }}
      onClick={() => onSelect(node.path)}
    >
      <span className="flex-shrink-0 text-sm">{fileIcon(node.name)}</span>
      <span className="truncate text-foreground">{node.name}</span>
      <span className="ml-auto text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
        {humanSize(node.size)}
      </span>
    </button>
  );
}

/* ── File Viewer ─────────────────────────────────────────────────── */

function FileViewer({
  agentId,
  companyId,
  filePath,
  onBack,
}: {
  agentId: string;
  companyId?: string;
  filePath: string;
  onBack: () => void;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["workspace-file", agentId, filePath],
    queryFn: () => workspaceFilesApi.read(agentId, filePath, companyId),
  });

  const fileName = filePath.split("/").pop() ?? filePath;
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const isMarkdown = ext === "md";

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card">
        <button
          onClick={onBack}
          className="p-1 rounded-md hover:bg-muted/50 transition-colors"
        >
          <ArrowLeft className="h-4 w-4 text-muted-foreground" />
        </button>
        <span className="text-sm">{fileIcon(fileName)}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{fileName}</p>
          {data && (
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              <span>{humanSize(data.size)}</span>
              <span>·</span>
              <Clock className="h-3 w-3 inline" />
              <span>{relativeTime(data.modified)}</span>
            </p>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {isLoading && (
          <div className="p-6 text-center text-muted-foreground text-sm">
            Loading file…
          </div>
        )}
        {error && (
          <div className="p-6 text-center text-destructive text-sm">
            Failed to load file
          </div>
        )}
        {data && (
          <div className="p-4">
            {isMarkdown ? (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <MarkdownContent content={data.content} />
              </div>
            ) : (
              <pre className="text-xs font-mono leading-relaxed text-foreground whitespace-pre-wrap break-words bg-muted/30 rounded-lg p-4 overflow-auto">
                {data.content}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Simple markdown renderer ────────────────────────────────────── */

function MarkdownContent({ content }: { content: string }) {
  // Simple markdown-to-HTML: headers, bold, italic, tables, lists, hr
  const html = content
    .replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold mt-4 mb-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-lg font-semibold mt-5 mb-2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold mt-6 mb-3">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^---$/gm, '<hr class="my-4 border-border" />')
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-sm">$1</li>')
    .replace(/^\| (.+) \|$/gm, (match) => {
      const cells = match
        .split("|")
        .filter(Boolean)
        .map((c) => c.trim());
      if (cells.every((c) => /^[-:]+$/.test(c))) return ""; // separator row
      const tag = "td";
      return `<tr>${cells.map((c) => `<${tag} class="border border-border px-3 py-1.5 text-xs">${c}</${tag}>`).join("")}</tr>`;
    })
    .replace(/\n\n/g, "</p><p>")
    .replace(/^(?!<[hHlLtTu])/gm, "");

  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

/* ── Main Panel ──────────────────────────────────────────────────── */

export function WorkspaceFilesPanel({
  agentId,
  companyId,
}: {
  agentId: string;
  companyId?: string;
}) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["workspace-files", agentId],
    queryFn: () => workspaceFilesApi.list(agentId, companyId),
    refetchInterval: 30_000, // refresh every 30s
  });

  const files = data?.files ?? [];
  const tree = buildTree(files);
  const fileCount = files.filter((f) => !f.isDirectory).length;

  if (selectedFile) {
    return (
      <FileViewer
        agentId={agentId}
        companyId={companyId}
        filePath={selectedFile}
        onBack={() => setSelectedFile(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Workspace Files</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Deliverables and artifacts produced by this agent
          </p>
        </div>
        {fileCount > 0 && (
          <span className="text-xs font-medium px-2 py-1 rounded-full bg-muted text-muted-foreground">
            {fileCount} file{fileCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="border border-border rounded-lg p-8 text-center">
          <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <div className="h-4 w-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
            Scanning workspace…
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="border border-destructive/20 rounded-lg p-4 text-center text-sm text-destructive">
          Failed to load workspace files
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && fileCount === 0 && (
        <div className="border border-dashed border-border/30 dark:border-border rounded-xl p-8 text-center">
          <File className="h-8 w-8 mx-auto text-stone-400 dark:text-muted-foreground/40 mb-3" strokeWidth={1.5} />
          <p className="text-sm font-medium text-muted-foreground">No workspace files yet</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Files will appear here once the agent completes a task
          </p>
        </div>
      )}

      {/* File tree */}
      {!isLoading && fileCount > 0 && (
        <div className="border border-border rounded-lg overflow-hidden divide-y divide-border">
          <div className="px-4 py-2 bg-muted/30 flex items-center gap-2">
            <Folder className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">workspace</span>
          </div>
          <div className="py-1">
            {tree.map((node) => (
              <FileTreeItem
                key={node.path}
                node={node}
                depth={0}
                onSelect={setSelectedFile}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
