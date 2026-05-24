import { useState, useRef } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  GitBranch,
  Plus,
  Pencil,
  Trash2,
  Globe,
  CheckCircle2,
  XCircle,
  Github,
  Triangle,
  AlertTriangle,
  Loader2,
  Download,
  Upload,
  CheckSquare,
  Square,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { reposApi } from "../lib/api";
import { formatDate } from "../lib/utils";
import type { Repository } from "../types";

function PlatformBadge({ platform }: { platform: string }) {
  if (platform === "github") {
    return (
      <span className="badge-github">
        <Github className="w-3 h-3" />
        GitHub
      </span>
    );
  }
  return (
    <span className="badge-gitlab">
      <Triangle className="w-3 h-3" />
      GitLab
    </span>
  );
}

function DeleteModal({
  name,
  onConfirm,
  onCancel,
  loading,
}: {
  name: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const { t } = useTranslation();
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="card p-6 max-w-sm w-full shadow-2xl"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-accent-red/10 border border-accent-red/20 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-accent-red" />
          </div>
          <div>
            <p className="font-semibold text-text-primary">{t("repositories.delete.title")}</p>
            <p className="text-xs text-text-muted">{t("repositories.delete.subtitle")}</p>
          </div>
        </div>
        <p className="text-sm text-text-secondary mb-5">
          {t("repositories.delete.confirm").replace("<name>", "")}<span className="font-mono text-text-primary">{name}</span>?
        </p>
        <div className="flex gap-2">
          <button onClick={onCancel} className="btn-secondary flex-1 justify-center">
            {t("common.cancel")}
          </button>
          <button onClick={onConfirm} disabled={loading} className="btn-danger flex-1 justify-center">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            {t("common.delete")}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function ImportModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const importMutation = useMutation({
    mutationFn: (repos: Partial<Repository>[]) => reposApi.import(repos),
    onSuccess: (data) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ["repositories"] });
      toast.success(`${data.imported} ${t("repositories.import.imported")}`);
    },
    onError: () => {
      setError(t("repositories.import.error"));
      toast.error(t("repositories.import.error"));
    },
  });

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target?.result as string);
        const repos = json.repositories ?? (Array.isArray(json) ? json : [json]);
        importMutation.mutate(repos);
      } catch {
        setError(t("repositories.import.invalidJson"));
        toast.error(t("repositories.import.invalidJson"));
      }
    };
    reader.readAsText(file);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="card p-6 max-w-sm w-full shadow-2xl"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Upload className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="font-semibold text-text-primary">{t("repositories.import.title")}</p>
            <p className="text-xs text-text-muted">{t("repositories.import.subtitle")}</p>
          </div>
        </div>

        {result ? (
          <div className="space-y-3">
            <div className="bg-bg-card border border-border rounded-lg p-4 text-center">
              <p className="text-lg font-bold text-primary">{result.imported} {t("repositories.import.imported")}</p>
              {result.skipped > 0 && (
                <p className="text-xs text-text-muted">{result.skipped} {t("repositories.import.skipped")}</p>
              )}
            </div>
            <button onClick={onClose} className="btn-primary w-full justify-center">
              {t("common.close")}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {error && (
              <div className="flex items-center gap-2 text-xs text-accent-red">
                <AlertTriangle className="w-3.5 h-3.5" />
                {error}
              </div>
            )}
            <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleFile} />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={importMutation.isPending}
              className="btn-primary w-full justify-center"
            >
              {importMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              {t("repositories.import.selectFile")}
            </button>
            <button onClick={onClose} className="btn-secondary w-full justify-center">
              {t("common.cancel")}
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

export default function RepositoriesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showImport, setShowImport] = useState(false);
  const [search, setSearch] = useState("");

  const { data: repos = [], isLoading } = useQuery({
    queryKey: ["repositories"],
    queryFn: reposApi.list,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => reposApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["repositories"] });
      toast.success(t("common.success"));
      setDeleteTarget(null);
      setSelected((prev) => { const n = new Set(prev); n.delete(deleteTarget?.id ?? ""); return n; });
    },
    onError: () => toast.error(t("common.error")),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      reposApi.update(id, { active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["repositories"] }),
  });

  const bulkMutation = useMutation({
    mutationFn: ({ action, ids }: { action: "activate" | "deactivate" | "delete"; ids: string[] }) =>
      reposApi.bulk(action, ids),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["repositories"] });
      setSelected(new Set());
      const actionKey = vars.action === "activate"
        ? "repositories.activate"
        : vars.action === "deactivate"
        ? "repositories.deactivate"
        : "common.success";
      toast.success(t(actionKey));
    },
    onError: () => toast.error(t("common.error")),
  });

  const handleExport = async () => {
    try {
      const data = await reposApi.export();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `repositories-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t("repositories.export"));
    } catch {
      toast.error(t("common.error"));
    }
  };

  const filteredRepos = search.trim()
    ? repos.filter((r) =>
        r.full_name.toLowerCase().includes(search.toLowerCase()) ||
        r.platform.toLowerCase().includes(search.toLowerCase())
      )
    : repos;

  const allSelected = filteredRepos.length > 0 && filteredRepos.every((r) => selected.has(r.id));
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(filteredRepos.map((r) => r.id)));
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3"
        >
          <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
            <GitBranch className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-text-primary">{t("repositories.title")}</h1>
            <p className="text-text-muted text-sm">{repos.length} {t("repositories.configured")}</p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="flex items-center gap-2 flex-wrap"
        >
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("common.search")}
              className="input pl-8 text-sm h-9 w-48"
            />
          </div>
          <button onClick={handleExport} className="btn-secondary text-sm">
            <Download className="w-4 h-4" />
            {t("repositories.export")}
          </button>
          <button onClick={() => setShowImport(true)} className="btn-secondary text-sm">
            <Upload className="w-4 h-4" />
            {t("repositories.import")}
          </button>
          <Link to="/repositories/new" className="btn-primary text-sm">
            <Plus className="w-4 h-4" />
            {t("repositories.addNew")}
          </Link>
        </motion.div>
      </div>

      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex items-center gap-2 p-3 bg-bg-card border border-border rounded-xl flex-wrap"
          >
            <span className="text-sm text-text-secondary">{selected.size} {t("repositories.selected")}</span>
            <div className="flex-1" />
            <button
              onClick={() => bulkMutation.mutate({ action: "activate", ids: [...selected] })}
              disabled={bulkMutation.isPending}
              className="btn-secondary text-xs py-1.5"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              {t("repositories.activate")}
            </button>
            <button
              onClick={() => bulkMutation.mutate({ action: "deactivate", ids: [...selected] })}
              disabled={bulkMutation.isPending}
              className="btn-secondary text-xs py-1.5"
            >
              <XCircle className="w-3.5 h-3.5" />
              {t("repositories.deactivate")}
            </button>
            <button
              onClick={() => bulkMutation.mutate({ action: "delete", ids: [...selected] })}
              disabled={bulkMutation.isPending}
              className="btn-danger text-xs py-1.5"
            >
              {bulkMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              {t("common.delete")}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : repos.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="card p-12 text-center"
        >
          <GitBranch className="w-12 h-12 text-text-muted mx-auto mb-3 opacity-50" />
          <p className="text-text-secondary font-medium">{t("repositories.empty.title")}</p>
          <p className="text-text-muted text-sm mt-1">{t("repositories.empty.description")}</p>
          <Link to="/repositories/new" className="btn-primary mt-4 inline-flex">
            <Plus className="w-4 h-4" />
            {t("repositories.empty.action")}
          </Link>
        </motion.div>
      ) : (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center gap-3">
            <button
              onClick={toggleAll}
              className="p-0.5 text-text-muted hover:text-text-secondary transition-colors"
            >
              {allSelected ? (
                <CheckSquare className="w-4 h-4 text-primary" />
              ) : (
                <Square className="w-4 h-4" />
              )}
            </button>
            <span className="text-xs text-text-muted">{t("repositories.selectAll")}</span>
            {search && (
              <span className="text-xs text-text-muted ml-auto">
                {filteredRepos.length} / {repos.length}
              </span>
            )}
          </div>
          <div className="divide-y divide-border">
            {filteredRepos.length === 0 ? (
              <div className="px-5 py-8 text-center text-text-muted text-sm">
                {t("common.search")}…
              </div>
            ) : null}
            {filteredRepos.map((repo, i) => (
              <motion.div
                key={repo.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className={`flex items-center gap-3 px-5 py-4 hover:bg-bg-hover transition-colors group ${selected.has(repo.id) ? "bg-primary/5" : ""}`}
              >
                <button
                  onClick={() => toggleOne(repo.id)}
                  className="p-0.5 text-text-muted hover:text-text-secondary transition-colors shrink-0"
                >
                  {selected.has(repo.id) ? (
                    <CheckSquare className="w-4 h-4 text-primary" />
                  ) : (
                    <Square className="w-4 h-4" />
                  )}
                </button>

                <div className="w-9 h-9 rounded-lg bg-bg-card border border-border flex items-center justify-center shrink-0">
                  <Globe className="w-4 h-4 text-text-secondary" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-text-primary">{repo.full_name}</span>
                    <PlatformBadge platform={repo.platform} />
                    {!repo.active && (
                      <span className="badge-skipped">{t("common.inactive")}</span>
                    )}
                  </div>
                  <p className="text-xs text-text-muted mt-0.5 font-mono truncate">
                    /webhook/{repo.webhook_token}
                  </p>
                  <p className="text-xs text-text-muted">{formatDate(repo.updated_at)}</p>
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => toggleActive.mutate({ id: repo.id, active: !repo.active })}
                    title={repo.active ? t("repositories.deactivate") : t("repositories.activate")}
                    className="p-2 rounded-lg hover:bg-bg-card transition-colors"
                  >
                    {repo.active ? (
                      <CheckCircle2 className="w-4 h-4 text-primary" />
                    ) : (
                      <XCircle className="w-4 h-4 text-text-muted" />
                    )}
                  </button>
                  <Link
                    to={`/repositories/${repo.id}`}
                    className="p-2 rounded-lg hover:bg-bg-card transition-colors"
                  >
                    <Pencil className="w-4 h-4 text-text-secondary" />
                  </Link>
                  <button
                    onClick={() => setDeleteTarget({ id: repo.id, name: repo.full_name })}
                    className="p-2 rounded-lg hover:bg-accent-red/10 transition-colors"
                  >
                    <Trash2 className="w-4 h-4 text-accent-red" />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      <AnimatePresence>
        {deleteTarget && (
          <DeleteModal
            name={deleteTarget.name}
            onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
            onCancel={() => setDeleteTarget(null)}
            loading={deleteMutation.isPending}
          />
        )}
        {showImport && <ImportModal onClose={() => setShowImport(false)} />}
      </AnimatePresence>
    </div>
  );
}
