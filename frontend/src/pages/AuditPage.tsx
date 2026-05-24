import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Loader2, Search, User, Shield, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { auditApi } from "../lib/api";
import { formatDate } from "../lib/utils";
import type { AuditLog } from "../types";

function actionColor(action: string): string {
  if (action.includes("delete") || action.includes("disabled") || action.includes("failed") || action.includes("locked")) return "text-accent-red";
  if (action.includes("enabled") || action === "login" || action === "logout") return "text-primary";
  if (action.includes("import") || action.includes("bulk") || action.includes("token")) return "text-accent-amber";
  return "text-text-secondary";
}

export default function AuditPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get("q") ?? "";
  const setSearch = (v: string) => setSearchParams(v ? { q: v } : {}, { replace: true });

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["audit"],
    queryFn: auditApi.list,
    refetchInterval: 30_000,
  });

  const filtered = logs.filter(
    (l: AuditLog) =>
      !search ||
      l.username.toLowerCase().includes(search.toLowerCase()) ||
      l.action.toLowerCase().includes(search.toLowerCase()) ||
      (l.details ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3"
      >
        <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
          <ClipboardList className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-text-primary">{t("audit.title")}</h1>
          <p className="text-text-muted text-sm">{logs.length} {t("audit.entries")}</p>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="relative"
      >
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("audit.searchPlaceholder")}
          className="input pl-9 pr-9"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </motion.div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <ClipboardList className="w-10 h-10 text-text-muted mx-auto mb-3 opacity-40" />
          <p className="text-text-secondary">{t("audit.empty")}</p>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="card overflow-hidden"
        >
          <div className="divide-y divide-border">
            {filtered.map((log: AuditLog, i: number) => (
              <motion.div
                key={log.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.02 }}
                className="flex items-start gap-3 px-5 py-3.5 hover:bg-bg-hover transition-colors"
              >
                <div className="w-7 h-7 rounded-full bg-bg-card border border-border flex items-center justify-center shrink-0 mt-0.5">
                  {log.action.includes("2fa") || log.action.includes("token") ? (
                    <Shield className="w-3.5 h-3.5 text-accent-amber" />
                  ) : (
                    <User className="w-3.5 h-3.5 text-text-muted" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-text-primary">{log.username}</span>
                    <span className={`text-xs font-medium ${actionColor(log.action)}`}>
                      {t(`audit.actions.${log.action}`, log.action)}
                    </span>
                    {log.target_type && (
                      <span className="text-xs text-text-muted font-mono">
                        {log.target_type}:{log.target_id?.slice(0, 8)}
                      </span>
                    )}
                  </div>
                  {log.details && (
                    <p className="text-xs text-text-muted mt-0.5 font-mono">{log.details}</p>
                  )}
                </div>
                <p className="text-xs text-text-muted shrink-0 mt-0.5">{formatDate(log.created_at)}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}
