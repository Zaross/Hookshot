import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ListChecks,
  RefreshCw,
  Trash2,
  AlertTriangle,
  Loader2,
  Clock,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { queueApi } from "../lib/api";
import { formatDate } from "../lib/utils";
import type { QueueItem } from "../types";

function StatusBadge({ status }: { status: QueueItem["status"] }) {
  const { t } = useTranslation();
  if (status === "pending") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
        <Clock className="w-3 h-3" />
        {t("queue.statusPending")}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-accent-red/10 text-accent-red border border-accent-red/20">
      <XCircle className="w-3 h-3" />
      {t("queue.statusFailed")}
    </span>
  );
}

export default function QueuePage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [purgeConfirm, setPurgeConfirm] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["queue"],
    queryFn: queueApi.list,
    refetchInterval: 5000,
  });

  const retryMutation = useMutation({
    mutationFn: (id: string) => queueApi.retry(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["queue"] });
      toast.success(t("queue.retry"));
    },
    onError: () => toast.error(t("common.error")),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => queueApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["queue"] });
      toast.success(t("common.success"));
    },
    onError: () => toast.error(t("common.error")),
  });

  const purgeMutation = useMutation({
    mutationFn: queueApi.purgeFailed,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["queue"] });
      setPurgeConfirm(false);
      toast.success(t("queue.purgeFailed"));
    },
    onError: () => toast.error(t("common.error")),
  });

  const items = data?.items ?? [];
  const pendingCount = data?.pending ?? 0;
  const failedCount = data?.failed ?? 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3"
        >
          <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
            <ListChecks className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-text-primary">{t("queue.title")}</h1>
            <p className="text-text-muted text-sm">{t("queue.subtitle")}</p>
          </div>
        </motion.div>

        {failedCount > 0 && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={() => setPurgeConfirm(true)}
            className="btn-danger text-sm"
          >
            <Trash2 className="w-4 h-4" />
            {t("queue.purgeFailed")}
          </motion.button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 max-w-xs">
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-yellow-400">{pendingCount}</p>
          <p className="text-xs text-text-muted mt-1">{t("queue.pending")}</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-accent-red">{failedCount}</p>
          <p className="text-xs text-text-muted mt-1">{t("queue.failed")}</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : items.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="card p-12 text-center"
        >
          <CheckCircle2 className="w-12 h-12 text-primary mx-auto mb-3 opacity-50" />
          <p className="text-text-secondary font-medium">{t("queue.empty")}</p>
        </motion.div>
      ) : (
        <div className="card overflow-hidden">
          <div className="divide-y divide-border">
            {items.map((item, i) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="flex items-center gap-4 px-5 py-4 hover:bg-bg-hover transition-colors group"
              >
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusBadge status={item.status} />
                    <span className="text-xs text-text-muted font-mono truncate max-w-xs">
                      {item.discord_url.replace("https://discord.com/api/webhooks/", "…/")}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-text-muted flex-wrap">
                    <span>
                      {t("queue.attempts")} {item.attempts}/{item.max_attempts}
                    </span>
                    <span>
                      {t("queue.nextRetry")}: {formatDate(item.next_retry_at)}
                    </span>
                    <span>
                      {t("queue.created")}: {formatDate(item.created_at)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => retryMutation.mutate(item.id)}
                    disabled={retryMutation.isPending}
                    title={t("queue.retry")}
                    className="p-2 rounded-lg hover:bg-primary/10 transition-colors"
                  >
                    {retryMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    ) : (
                      <RefreshCw className="w-4 h-4 text-primary" />
                    )}
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate(item.id)}
                    disabled={deleteMutation.isPending}
                    title={t("queue.delete")}
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
        {purgeConfirm && (
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
                <p className="font-semibold text-text-primary">{t("queue.purgeFailed")}</p>
              </div>
              <p className="text-sm text-text-secondary mb-5">{t("queue.purgeConfirm")}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPurgeConfirm(false)}
                  className="btn-secondary flex-1 justify-center"
                >
                  {t("common.cancel")}
                </button>
                <button
                  onClick={() => purgeMutation.mutate()}
                  disabled={purgeMutation.isPending}
                  className="btn-danger flex-1 justify-center"
                >
                  {purgeMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  {t("common.delete")}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
