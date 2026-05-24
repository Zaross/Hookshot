import { motion } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  GitBranch,
  CheckCircle2,
  XCircle,
  Activity,
  TrendingUp,
  Webhook,
  SkipForward,
  Percent,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { useTranslation } from "react-i18next";
import { statsApi, reposApi } from "../lib/api";
import { useLogStream } from "../hooks/useLogStream";
import { cn } from "../lib/utils";

function StatCard({
  label,
  value,
  icon: Icon,
  colorClass,
  delay,
  sub,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  colorClass: string;
  delay: number;
  sub?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3 }}
      className="card p-5 hover:border-border-light transition-colors"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-text-muted text-xs font-medium uppercase tracking-wide mb-1">{label}</p>
          <p className="text-3xl font-bold text-text-primary">{value}</p>
          {sub && <p className="text-xs text-text-muted mt-1">{sub}</p>}
        </div>
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", colorClass)}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </motion.div>
  );
}

const CHART_TOOLTIP_STYLE = {
  contentStyle: {
    background: "#131720",
    border: "1px solid #252836",
    borderRadius: "8px",
    fontSize: "12px",
    color: "#f1f3f5",
  },
};

export default function DashboardPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  // Invalidate stats whenever a new webhook log arrives via SSE
  const isLive = useLogStream(() => {
    queryClient.invalidateQueries({ queryKey: ["stats"] });
  });

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["stats"],
    queryFn: statsApi.get,
    // Stop polling while SSE is delivering real-time updates
    refetchInterval: isLive ? false : 30_000,
  });

  const { data: repos = [] } = useQuery({
    queryKey: ["repositories"],
    queryFn: reposApi.list,
  });

  const activeRepos = repos.filter((r) => r.active).length;

  return (
    <div className="p-6 space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3"
      >
        <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
          <Activity className="w-4 h-4 text-primary" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-text-primary">{t("dashboard.title")}</h1>
            {isLive && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                Live
              </span>
            )}
          </div>
          <p className="text-text-muted text-sm">{t("dashboard.subtitle")}</p>
        </div>
      </motion.div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label={t("dashboard.activeRepos")}
          value={activeRepos}
          icon={GitBranch}
          colorClass="bg-accent-blue/10 text-accent-blue"
          delay={0}
        />
        <StatCard
          label={t("dashboard.webhooks24h")}
          value={stats?.total_24h ?? "–"}
          icon={Webhook}
          colorClass="bg-primary/10 text-primary"
          delay={0.05}
          sub={`${t("dashboard.total")}: ${stats?.total_all ?? "–"}`}
        />
        <StatCard
          label={`${t("dashboard.successful")} (24h)`}
          value={stats?.success_24h ?? "–"}
          icon={TrendingUp}
          colorClass="bg-primary/10 text-primary"
          delay={0.1}
          sub={`${t("dashboard.successRate")}: ${stats?.success_rate ?? "–"}%`}
        />
        <StatCard
          label={`${t("dashboard.failed")} (24h)`}
          value={stats?.failed_24h ?? "–"}
          icon={XCircle}
          colorClass="bg-accent-red/10 text-accent-red"
          delay={0.15}
          sub={`${t("dashboard.skipped")}: ${stats?.skipped_24h ?? "–"}`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Activity chart */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="card p-5 lg:col-span-2"
        >
          <div className="flex items-center gap-2 mb-5">
            <Activity className="w-4 h-4 text-primary" />
            <span className="font-semibold text-text-primary text-sm">{t("dashboard.activity7d")}</span>
          </div>

          {statsLoading || !stats?.by_day?.length ? (
            <div className="h-48 flex items-center justify-center text-text-muted text-sm">
              {statsLoading ? t("dashboard.loading") : t("dashboard.noData")}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={stats.by_day} barSize={10} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="#252836" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: "#6b7280", fontSize: 11 }}
                  tickFormatter={(v: string) => v.slice(5)}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "#6b7280", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip {...CHART_TOOLTIP_STYLE} />
                <Legend
                  wrapperStyle={{ fontSize: 11, color: "#9ca3af" }}
                  formatter={(v: string) =>
                    v === "success"
                      ? t("dashboard.successful")
                      : v === "failed"
                      ? t("dashboard.failed")
                      : t("dashboard.skipped")
                  }
                />
                <Bar dataKey="success" fill="#22E8DC" radius={[3, 3, 0, 0]} />
                <Bar dataKey="failed"  fill="#ef4444" radius={[3, 3, 0, 0]} />
                <Bar dataKey="skipped" fill="#4b5563" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </motion.div>

        {/* Top repos */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="card p-5"
        >
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-primary" />
            <span className="font-semibold text-text-primary text-sm">{t("dashboard.topRepos")}</span>
          </div>

          {!stats?.by_repo?.length ? (
            <p className="text-text-muted text-sm text-center py-8">{t("dashboard.noData")}</p>
          ) : (
            <div className="space-y-3">
              {stats.by_repo.map((repo) => {
                const successPct = repo.total > 0 ? Math.round((repo.success / repo.total) * 100) : 0;
                return (
                  <div key={repo.name}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-text-primary truncate max-w-[130px]">
                        {repo.name}
                      </span>
                      <span className="text-xs text-text-muted shrink-0">{repo.total} {t("dashboard.total").toLowerCase()}</span>
                    </div>
                    <div className="h-1.5 bg-bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${successPct}%` }}
                      />
                    </div>
                    <div className="flex justify-between mt-0.5">
                      <span className="text-[10px] text-primary">{repo.success} ok</span>
                      {repo.failed > 0 && (
                        <span className="text-[10px] text-accent-red">{repo.failed} err</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>
      </div>

      {/* Overview card */}
      {stats && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="card p-5"
        >
          <div className="flex items-center gap-2 mb-4">
            <Percent className="w-4 h-4 text-primary" />
            <span className="font-semibold text-text-primary text-sm">{t("dashboard.overview")}</span>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {[
              { label: t("dashboard.successful"), count: stats.total_all - stats.failed_24h, icon: CheckCircle2, color: "text-primary" },
              { label: t("dashboard.failed"),     count: stats.failed_24h,                   icon: XCircle,      color: "text-accent-red" },
              { label: t("dashboard.skipped"),    count: stats.skipped_24h,                  icon: SkipForward,  color: "text-text-muted" },
            ].map(({ label, count, icon: Icon, color }) => (
              <div key={label} className="flex items-center gap-3 p-3 rounded-lg bg-bg-secondary border border-border">
                <Icon className={cn("w-5 h-5 shrink-0", color)} />
                <div>
                  <p className="text-xs text-text-muted">{label}</p>
                  <p className={cn("text-lg font-bold", color)}>{count}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4">
            <div className="flex justify-between text-xs text-text-muted mb-1">
              <span>{t("dashboard.successRateAll")}</span>
              <span>{stats.success_rate}%</span>
            </div>
            <div className="h-2 bg-bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{ width: `${stats.success_rate}%` }}
              />
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
