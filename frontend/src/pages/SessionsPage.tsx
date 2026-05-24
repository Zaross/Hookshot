import { motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MonitorSmartphone, Loader2, Shield, LogOut, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { sessionsApi } from "../lib/api";
import { formatDate } from "../lib/utils";

function parseDevice(ua?: string): string {
  if (!ua) return "Unknown";
  if (/mobile/i.test(ua)) return "Mobile";
  if (/tablet/i.test(ua)) return "Tablet";
  if (/chrome/i.test(ua)) return "Chrome";
  if (/firefox/i.test(ua)) return "Firefox";
  if (/safari/i.test(ua)) return "Safari";
  if (/edge/i.test(ua)) return "Edge";
  return ua.slice(0, 40);
}

export default function SessionsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["sessions"],
    queryFn: sessionsApi.list,
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => sessionsApi.revoke(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      toast.success(t("sessions.revoke"));
    },
    onError: () => toast.error(t("common.error")),
  });

  const revokeOthersMutation = useMutation({
    mutationFn: sessionsApi.revokeOthers,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      toast.success(t("sessions.revokeOthers"));
    },
    onError: () => toast.error(t("common.error")),
  });

  const otherSessions = sessions.filter((s) => !s.is_current);

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
            <MonitorSmartphone className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-text-primary">{t("sessions.title")}</h1>
            <p className="text-text-muted text-sm">{t("sessions.subtitle")}</p>
          </div>
        </div>

        {otherSessions.length > 0 && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={() => {
              if (confirm(t("sessions.revokeConfirm"))) {
                revokeOthersMutation.mutate();
              }
            }}
            disabled={revokeOthersMutation.isPending}
            className="btn-danger text-sm"
          >
            {revokeOthersMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
            {t("sessions.revokeOthers")}
          </motion.button>
        )}
      </motion.div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : sessions.length === 0 ? (
        <div className="card p-12 text-center">
          <MonitorSmartphone className="w-10 h-10 text-text-muted mx-auto mb-3 opacity-40" />
          <p className="text-text-secondary">{t("sessions.empty")}</p>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="card overflow-hidden"
        >
          <div className="divide-y divide-border">
            {sessions.map((session, i) => (
              <motion.div
                key={session.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.04 }}
                className={`flex items-center gap-3 px-5 py-4 transition-colors ${
                  session.is_current ? "bg-primary/5" : "hover:bg-bg-hover"
                }`}
              >
                <div
                  className="w-9 h-9 rounded-lg border flex items-center justify-center shrink-0"
                  style={
                    session.is_current
                      ? { background: "rgba(34,232,220,0.1)", borderColor: "rgba(34,232,220,0.2)" }
                      : { background: "var(--bg-card)", borderColor: "var(--border)" }
                  }
                >
                  {session.is_current ? (
                    <Shield className="w-4 h-4" style={{ color: "#22E8DC" }} />
                  ) : (
                    <MonitorSmartphone className="w-4 h-4 text-text-secondary" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-text-primary truncate">
                      {parseDevice(session.user_agent)}
                    </p>
                    {session.is_current && (
                      <span className="badge-success text-xs">{t("sessions.current")}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <p className="text-xs text-text-muted">
                      {t("sessions.created")}: {formatDate(session.created_at)}
                    </p>
                    <p className="text-xs text-text-muted">
                      {t("sessions.expires")}: {formatDate(session.expires_at)}
                    </p>
                  </div>
                </div>

                {!session.is_current && (
                  <button
                    onClick={() => revokeMutation.mutate(session.id)}
                    disabled={revokeMutation.isPending}
                    className="btn-danger py-1.5 px-3 text-xs shrink-0"
                  >
                    {revokeMutation.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <LogOut className="w-3.5 h-3.5" />
                    )}
                    {t("sessions.revoke")}
                  </button>
                )}
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}
