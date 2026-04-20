import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useToast } from "../context/ToastContext";
import { secretsApi } from "../api/secrets";
import type { CompanySecret, SecretProviderDescriptor } from "@mattparrytfc/shared";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  KeyRound,
  Plus,
  RotateCw,
  Trash2,
  Eye,
  EyeOff,
  Copy,
  Check,
  ShieldCheck,
  Pencil,
} from "lucide-react";

/* ── Helpers ─────────────────────────────────────────────────────────── */

function relativeTime(dateInput: string | Date): string {
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  const now = Date.now();
  const diffMs = now - date.getTime();
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}

function providerLabel(providerId: string, providers: SecretProviderDescriptor[]): string {
  const found = providers.find((p) => p.id === providerId);
  return found?.label ?? providerId.replace(/_/g, " ");
}

function providerBadgeVariant(providerId: string): "default" | "secondary" | "outline" {
  if (providerId === "local_encrypted") return "secondary";
  if (providerId === "vault") return "default";
  return "outline";
}

/* ── Create Secret Dialog ────────────────────────────────────────────── */

function CreateSecretDialog({
  open,
  onOpenChange,
  companyId,
  providers,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  providers: SecretProviderDescriptor[];
}) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [description, setDescription] = useState("");
  const [provider, setProvider] = useState<string>("");
  const [showValue, setShowValue] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setValue("");
      setDescription("");
      setProvider(providers[0]?.id ?? "local_encrypted");
      setShowValue(false);
    }
  }, [open, providers]);

  // Only send provider if user explicitly picked a non-default one.
  // The server applies its own default when provider is omitted, avoiding
  // validation mismatches (e.g. railway_env isn't in the zod enum).
  const defaultProviderId = providers[0]?.id ?? "";

  const createMutation = useMutation({
    mutationFn: () =>
      secretsApi.create(companyId, {
        name: name.trim(),
        value: value,
        ...(provider && provider !== defaultProviderId ? { provider: provider as any } : {}),
        description: description.trim() || null,
      }),
    onSuccess: (secret) => {
      queryClient.invalidateQueries({ queryKey: ["secrets", companyId] });
      pushToast({ title: "Secret created", body: `"${secret.name}" is now available.` });
      onOpenChange(false);
    },
    onError: (err) => {
      pushToast({
        title: "Failed to create secret",
        body: err instanceof Error ? err.message : "Unknown error",
        tone: "error",
      });
    },
  });

  const canSubmit = name.trim().length > 0 && value.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Secret</DialogTitle>
          <DialogDescription>
            Store an API key or secret value. The value is encrypted at rest.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Name</label>
            <input
              className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
              placeholder="e.g. ANTHROPIC_API_KEY"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Value</label>
            <div className="relative">
              <input
                className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 pr-9 text-sm font-mono outline-none focus:ring-1 focus:ring-ring"
                type={showValue ? "text" : "password"}
                placeholder="sk-ant-..."
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowValue(!showValue)}
              >
                {showValue ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Description (optional)</label>
            <input
              className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
              placeholder="Production Anthropic key for agent operations"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          {providers.length > 1 && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Provider</label>
              <select
                className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
              >
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!canSubmit || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            {createMutation.isPending ? "Creating..." : "Create secret"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Rotate Secret Dialog ────────────────────────────────────────────── */

function RotateSecretDialog({
  open,
  onOpenChange,
  secret,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  secret: CompanySecret | null;
}) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [newValue, setNewValue] = useState("");
  const [showValue, setShowValue] = useState(false);

  useEffect(() => {
    if (open) {
      setNewValue("");
      setShowValue(false);
    }
  }, [open]);

  const rotateMutation = useMutation({
    mutationFn: () => secretsApi.rotate(secret!.id, { value: newValue }),
    onSuccess: (rotated) => {
      queryClient.invalidateQueries({ queryKey: ["secrets", rotated.companyId] });
      pushToast({
        title: "Secret rotated",
        body: `"${rotated.name}" updated to version ${rotated.latestVersion}.`,
      });
      onOpenChange(false);
    },
    onError: (err) => {
      pushToast({
        title: "Failed to rotate secret",
        body: err instanceof Error ? err.message : "Unknown error",
        tone: "error",
      });
    },
  });

  if (!secret) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rotate Secret</DialogTitle>
          <DialogDescription>
            Enter a new value for <span className="font-mono font-semibold">{secret.name}</span>.
            This creates version {secret.latestVersion + 1}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">New value</label>
            <div className="relative">
              <input
                className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 pr-9 text-sm font-mono outline-none focus:ring-1 focus:ring-ring"
                type={showValue ? "text" : "password"}
                placeholder="New secret value..."
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                autoFocus
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowValue(!showValue)}
              >
                {showValue ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={newValue.length === 0 || rotateMutation.isPending}
            onClick={() => rotateMutation.mutate()}
          >
            {rotateMutation.isPending ? "Rotating..." : "Rotate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Edit Secret Dialog ──────────────────────────────────────────────── */

function EditSecretDialog({
  open,
  onOpenChange,
  secret,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  secret: CompanySecret | null;
}) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");

  useEffect(() => {
    if (open && secret) {
      setEditName(secret.name);
      setEditDescription(secret.description ?? "");
    }
  }, [open, secret]);

  const updateMutation = useMutation({
    mutationFn: () =>
      secretsApi.update(secret!.id, {
        name: editName.trim() || undefined,
        description: editDescription.trim() || null,
      }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["secrets", updated.companyId] });
      pushToast({ title: "Secret updated", body: `"${updated.name}" saved.` });
      onOpenChange(false);
    },
    onError: (err) => {
      pushToast({
        title: "Failed to update secret",
        body: err instanceof Error ? err.message : "Unknown error",
        tone: "error",
      });
    },
  });

  if (!secret) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Secret</DialogTitle>
          <DialogDescription>Update the name or description. To change the value, use Rotate.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Name</label>
            <input
              className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Description</label>
            <input
              className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              placeholder="Optional description"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={editName.trim().length === 0 || updateMutation.isPending}
            onClick={() => updateMutation.mutate()}
          >
            {updateMutation.isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Secret Row ──────────────────────────────────────────────────────── */

function SecretRow({
  secret,
  providers,
  onRotate,
  onEdit,
  onDelete,
}: {
  secret: CompanySecret;
  providers: SecretProviderDescriptor[];
  onRotate: (s: CompanySecret) => void;
  onEdit: (s: CompanySecret) => void;
  onDelete: (s: CompanySecret) => void;
}) {
  const [copied, setCopied] = useState(false);

  function handleCopyName() {
    navigator.clipboard.writeText(secret.name).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="group flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0 hover:bg-muted/30 transition-colors">
      {/* Icon */}
      <div className="shrink-0 rounded-md bg-muted/60 p-1.5">
        <ShieldCheck className="h-4 w-4 text-muted-foreground" />
      </div>

      {/* Name + description */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-medium truncate">{secret.name}</span>
          <button
            type="button"
            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
            onClick={handleCopyName}
            title="Copy name"
          >
            {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
          </button>
        </div>
        {secret.description && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">{secret.description}</p>
        )}
      </div>

      {/* Provider badge */}
      <Badge variant={providerBadgeVariant(secret.provider)} className="shrink-0 text-[10px]">
        {providerLabel(secret.provider, providers)}
      </Badge>

      {/* Version */}
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums" title="Secret version">
        v{secret.latestVersion}
      </span>

      {/* Updated timestamp */}
      <span className="hidden sm:inline shrink-0 text-xs text-muted-foreground" title={new Date(secret.updatedAt).toLocaleString()}>
        {relativeTime(secret.updatedAt)}
      </span>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Edit" onClick={() => onEdit(secret)}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Rotate value" onClick={() => onRotate(secret)}>
          <RotateCw className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
          title="Delete"
          onClick={() => onDelete(secret)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

/* ── Main Page ───────────────────────────────────────────────────────── */

export function Secrets() {
  const { selectedCompany, selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [rotateSecret, setRotateSecret] = useState<CompanySecret | null>(null);
  const [editSecret, setEditSecret] = useState<CompanySecret | null>(null);
  const [deleteSecret, setDeleteSecret] = useState<CompanySecret | null>(null);

  useEffect(() => {
    setBreadcrumbs([
      { label: selectedCompany?.name ?? "Company", href: "/dashboard" },
      { label: "Secrets" },
    ]);
  }, [setBreadcrumbs, selectedCompany?.name]);

  const secretsQuery = useQuery({
    queryKey: ["secrets", selectedCompanyId],
    queryFn: () => secretsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 30_000,
  });

  const providersQuery = useQuery({
    queryKey: ["secret-providers", selectedCompanyId],
    queryFn: () => secretsApi.providers(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => secretsApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["secrets", selectedCompanyId] });
      pushToast({ title: "Secret deleted" });
      setDeleteSecret(null);
    },
    onError: (err) => {
      pushToast({
        title: "Failed to delete secret",
        body: err instanceof Error ? err.message : "Unknown error",
        tone: "error",
      });
    },
  });

  const secrets = secretsQuery.data ?? [];
  const providers = providersQuery.data ?? [];

  if (!selectedCompany) {
    return (
      <div className="text-sm text-muted-foreground">
        No company selected. Select a company from the switcher above.
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Secrets &amp; API Keys</h1>
          {secrets.length > 0 && (
            <Badge variant="secondary" className="text-[10px]">
              {secrets.length}
            </Badge>
          )}
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add secret
        </Button>
      </div>

      {/* Description */}
      <p className="text-sm text-muted-foreground">
        Secrets are encrypted at rest and injected into agent environments at runtime.
        Agents reference secrets by name — the actual values are never exposed in configuration.
      </p>

      {/* Secret list */}
      {secretsQuery.isLoading ? (
        <div className="text-sm text-muted-foreground">Loading secrets...</div>
      ) : secretsQuery.isError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {secretsQuery.error instanceof Error
            ? secretsQuery.error.message
            : "Failed to load secrets."}
        </div>
      ) : secrets.length === 0 ? (
        <div className="rounded-md border border-dashed border-border px-6 py-12 text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-muted-foreground/30" />
          <p className="mt-3 text-sm font-medium text-muted-foreground">No secrets yet</p>
          <p className="mt-1 text-xs text-muted-foreground/70">
            Add an API key to get your agents connected to external services.
          </p>
          <Button size="sm" variant="outline" className="mt-4" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add your first secret
          </Button>
        </div>
      ) : (
        <div className="rounded-md border border-border overflow-hidden">
          {/* Table header */}
          <div className="flex items-center gap-3 border-b border-border bg-muted/40 px-4 py-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            <div className="shrink-0 w-[30px]" />
            <div className="flex-1">Name</div>
            <div className="shrink-0 w-[100px] text-center">Provider</div>
            <div className="shrink-0 w-[32px] text-center">Ver</div>
            <div className="hidden sm:block shrink-0 w-[70px] text-right">Updated</div>
            <div className="shrink-0 w-[90px]" />
          </div>
          {secrets.map((secret) => (
            <SecretRow
              key={secret.id}
              secret={secret}
              providers={providers}
              onRotate={setRotateSecret}
              onEdit={setEditSecret}
              onDelete={setDeleteSecret}
            />
          ))}
        </div>
      )}

      {/* Dialogs */}
      <CreateSecretDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        companyId={selectedCompanyId!}
        providers={providers}
      />

      <RotateSecretDialog
        open={!!rotateSecret}
        onOpenChange={(open) => { if (!open) setRotateSecret(null); }}
        secret={rotateSecret}
      />

      <EditSecretDialog
        open={!!editSecret}
        onOpenChange={(open) => { if (!open) setEditSecret(null); }}
        secret={editSecret}
      />

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteSecret} onOpenChange={(open) => { if (!open) setDeleteSecret(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Secret</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-mono font-semibold">{deleteSecret?.name}</span>?
              Agents referencing this secret will lose access to its value.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setDeleteSecret(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={deleteMutation.isPending}
              onClick={() => deleteSecret && deleteMutation.mutate(deleteSecret.id)}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
