import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ScrollText,
  CheckCircle2,
  XCircle,
  SkipForward,
  Loader2,
  Filter,
  RefreshCw,
  RotateCcw,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { logsApi, reposApi } from "../lib/api";
import { useLogStream } from "../hooks/useLogStream";
import { formatDate } from "../lib/utils";
import { cn } from "../lib/utils";
import type { WebhookLog } from "../types";

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const map = {
    success: { icon: <CheckCircle2 className="w-3 h-3" />, cls: "badge-success",  label: t("logs.statusSuccess") },
    failed:  { icon: <XCircle      className="w-3 h-3" />, cls: "badge-failed",   label: t("logs.statusFailed")  },
    skipped: { icon: <SkipForward  className="w-3 h-3" />, cls: "badge-skipped",  label: t("logs.statusSkipped") },
  };
  const s = map[status as keyof typeof map] ?? map.skipped;
  return (
    <span className={s.cls}>
      {s.icon}
      {s.label}
    </span>
  );
}

function LogDetailModal({ log, onClose }: { log: WebhookLog; onClose: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [retryState, setRetryState] = useState<"idle" | "loading" | "success" | "error">("idle");

  const retryMutation = useMutation({
    mutationFn: () => logsApi.retry(log.id),
    onSuccess: () => {
      setRetryState("success");
      queryClient.invalidateQueries({ queryKey: ["logs"] });
      toast.success(t("logs.retrySent"));
      setTimeout(() => setRetryState("idle"), 3000);
    },
    onError: () => {
      setRetryState("error");
      toast.error(t("logs.retryError"));
      setTimeout(() => setRetryState("idle"), 3000);
    },
  });

  const payload = (() => {
    try { return JSON.stringify(JSON.parse(log.payload), null, 2); } catch { return log.payload; }
  })();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 8 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 8 }}
        transition={{ duration: 0.2 }}
        onClick={(e) => e.stopPropagation()}
        className="card max-w-2xl w-full shadow-2xl flex flex-col max-h-[85vh]"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <ScrollText className="w-4 h-4 text-primary" />
            <span className="font-semibold text-text-primary text-sm">{t("logs.detail")}</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-bg-hover text-text-muted transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Meta */}
        <div className="px-5 py-3 border-b border-border grid grid-cols-2 gap-x-6 gap-y-3 shrink-0">
          <div>
            <p className="text-xs text-text-muted mb-0.5">{t("logs.eventType")}</p>
            <p className="text-sm font-medium text-text-primary">{log.event_type}</p>
          </div>
          <div>
            <p className="text-xs text-text-muted mb-0.5">{t("logs.status")}</p>
            <StatusBadge status={log.status} />
          </div>
          <div>
            <p className="text-xs text-text-muted mb-0.5">{t("logs.platform")}</p>
            <span className="text-xs px-1.5 py-0.5 rounded bg-bg-card border border-border text-text-muted font-mono">
              {log.platform}
            </span>
          </div>
          <div>
            <p className="text-xs text-text-muted mb-0.5">{t("logs.date")}</p>
            <p className="text-sm text-text-primary">{formatDate(log.created_at)}</p>
          </div>
          {log.error_message && (
            <div className="col-span-2">
              <p className="text-xs text-text-muted mb-0.5">{t("logs.errorMessage")}</p>
              <p className="text-sm text-accent-red">{log.error_message}</p>
            </div>
          )}
        </div>

        {/* Payload */}
        <div className="px-5 py-3 flex-1 overflow-hidden flex flex-col min-h-0">
          <p className="text-xs text-text-muted mb-2">{t("logs.payload")}</p>
          <pre className="bg-bg-primary border border-border rounded-lg p-3 text-xs font-mono text-text-secondary overflow-auto flex-1">
            {payload}
          </pre>
        </div>

        {/* Footer */}
        {log.status === "failed" && (
          <div className="px-5 py-3 border-t border-border shrink-0">
            <button
              onClick={() => { setRetryState("loading"); retryMutation.mutate(); }}
              disabled={retryState === "loading"}
              className={cn(
                "btn-secondary text-sm",
                retryState === "success" && "text-primary border-primary/20",
                retryState === "error" && "text-accent-red border-accent-red/20",
              )}
            >
              {retryState === "loading" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : retryState === "success" ? (
                <CheckCircle2 className="w-3.5 h-3.5" />
              ) : (
                <RotateCcw className="w-3.5 h-3.5" />
              )}
              {t("logs.retry")}
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

function LogRow({ log, onSelect }: { log: WebhookLog; onSelect: (log: WebhookLog) => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [retryState, setRetryState] = useState<"idle" | "loading" | "success" | "error">("idle");

  const retryMutation = useMutation({
    mutationFn: () => logsApi.retry(log.id),
    onSuccess: () => {
      setRetryState("success");
      queryClient.invalidateQueries({ queryKey: ["logs"] });
      toast.success(t("logs.retrySent"));
      setTimeout(() => setRetryState("idle"), 3000);
    },
    onError: () => {
      setRetryState("error");
      toast.error(t("logs.retryError"));
      setTimeout(() => setRetryState("idle"), 3000);
    },
  });

  return (
    <div className="border-b border-border last:border-0">
      <button
        onClick={() => onSelect(log)}
        className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-bg-hover transition-colors text-left"
      >
        <div className="shrink-0">
          {log.status === "success" && <CheckCircle2 className="w-4 h-4 text-primary" />}
          {log.status === "failed"  && <XCircle      className="w-4 h-4 text-accent-red" />}
          {log.status === "skipped" && <SkipForward  className="w-4 h-4 text-text-muted" />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-text-primary">{log.event_type}</span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-bg-card border border-border text-text-muted font-mono">
              {log.platform}
            </span>
            {log.error_message && (
              <span className="text-xs text-accent-red truncate max-w-xs">{log.error_message}</span>
            )}
          </div>
          <p className="text-xs text-text-muted mt-0.5">{formatDate(log.created_at)}</p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge status={log.status} />
          {log.status === "failed" && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setRetryState("loading");
                retryMutation.mutate();
              }}
              disabled={retryState === "loading"}
              title={t("logs.retry")}
              className={cn(
                "p-1.5 rounded-lg border transition-all text-xs",
                retryState === "success" && "border-primary/20 bg-primary/10 text-primary",
                retryState === "error"   && "border-accent-red/20 bg-accent-red/10 text-accent-red",
                retryState === "idle"    && "border-border bg-bg-hover text-text-secondary hover:text-primary hover:border-primary/30",
                retryState === "loading" && "border-border bg-bg-hover text-text-muted"
              )}
            >
              {retryState === "loading" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : retryState === "success" ? (
                <CheckCircle2 className="w-3.5 h-3.5" />
              ) : (
                <RotateCcw className="w-3.5 h-3.5" />
              )}
            </button>
          )}
        </div>
      </button>
    </div>
  );
}

const PAGE_SIZE = 25;

export default function LogsPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = parseInt(searchParams.get("page") ?? "0", 10);
  const statusFilter = searchParams.get("status") ?? "";
  const platformFilter = searchParams.get("platform") ?? "";
  const repoFilter = searchParams.get("repo") ?? "";
  const [selectedLog, setSelectedLog] = useState<WebhookLog | null>(null);
  const isLive = useLogStream();

  const updateFilter = (key: string, value: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.delete(key);
      next.delete("page");
      return next;
    });
  };

  const setPage = (newPage: number) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (newPage === 0) next.delete("page");
      else next.set("page", String(newPage));
      return next;
    });
  };

  const { data: repos = [] } = useQuery({
    queryKey: ["repositories"],
    queryFn: reposApi.list,
  });

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["logs", page, statusFilter, platformFilter, repoFilter],
    queryFn: () =>
      logsApi.list({
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        status: statusFilter || undefined,
        platform: platformFilter || undefined,
        repository_id: repoFilter || undefined,
      }),
    refetchInterval: isLive ? false : 30_000,
  });

  const totalPages = Math.ceil((data?.total ?? 0) / PAGE_SIZE);

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3"
        >
          <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
            <ScrollText className="w-4 h-4 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-text-primary">{t("logs.title")}</h1>
              {isLive && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  Live
                </span>
              )}
            </div>
            <p className="text-text-muted text-sm">{data?.total ?? 0} {t("common.entries")}</p>
          </div>
        </motion.div>

        <button onClick={() => refetch()} disabled={isFetching} className="btn-secondary">
          <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
          {t("common.refresh")}
        </button>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="card p-4"
      >
        <div className="flex items-center gap-3 flex-wrap">
          <Filter className="w-4 h-4 text-text-muted shrink-0" />
          <select
            value={statusFilter}
            onChange={(e) => updateFilter("status", e.target.value)}
            className="input w-auto text-sm"
          >
            <option value="">{t("logs.filterAll")}</option>
            <option value="success">{t("logs.filterSuccess")}</option>
            <option value="failed">{t("logs.filterFailed")}</option>
            <option value="skipped">{t("logs.filterSkipped")}</option>
          </select>

          <select
            value={platformFilter}
            onChange={(e) => updateFilter("platform", e.target.value)}
            className="input w-auto text-sm"
          >
            <option value="">{t("logs.platformAll")}</option>
            <option value="github">GitHub</option>
            <option value="gitlab">GitLab</option>
          </select>

          <select
            value={repoFilter}
            onChange={(e) => updateFilter("repo", e.target.value)}
            className="input w-auto text-sm"
          >
            <option value="">{t("logs.repoAll")}</option>
            {repos.map((r) => (
              <option key={r.id} value={r.id}>{r.full_name}</option>
            ))}
          </select>

          {(statusFilter || platformFilter || repoFilter) && (
            <button
              onClick={() => setSearchParams({})}
              className="text-xs text-accent-red hover:underline"
            >
              {t("common.resetFilter")}
            </button>
          )}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="card overflow-hidden"
      >
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : data?.logs.length === 0 ? (
          <div className="py-12 text-center text-text-muted text-sm">{t("logs.empty")}</div>
        ) : (
          data?.logs.map((log) => (
            <LogRow key={log.id} log={log} onSelect={setSelectedLog} />
          ))
        )}
      </motion.div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-text-muted">
            {t("common.page")} {page + 1} {t("common.of")} {totalPages}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="btn-secondary px-3"
            >
              {t("common.back")}
            </button>
            <button
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              className="btn-secondary px-3"
            >
              {t("common.next")}
            </button>
          </div>
        </div>
      )}

      <AnimatePresence>
        {selectedLog && (
          <LogDetailModal log={selectedLog} onClose={() => setSelectedLog(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
