import { useState, useEffect } from "react";
import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  GitBranch,
  ScrollText,
  Users,
  Settings,
  LogOut,
  User,
  ChevronRight,
  ClipboardList,
  Sun,
  Moon,
  MonitorSmartphone,
  ListChecks,
  Menu,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../store/authStore";
import { useThemeStore } from "../store/themeStore";
import { authApi } from "../lib/api";
import { cn } from "../lib/utils";

function AppLogo() {
  return (
    <svg width="24" height="24" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="22" y="28" width="10" height="58" rx="4" fill="#22E8DC" />
      <rect x="22" y="51" width="36" height="10" rx="4" fill="#22E8DC" />
      <path d="M58 28 L58 56 L88 56 L88 28" stroke="#22E8DC" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M88 56 L96 56 L96 64" stroke="#22E8DC" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <line x1="81" y1="73" x2="95" y2="57" stroke="#22E8DC" strokeWidth="7" strokeLinecap="round" />
    </svg>
  );
}

function LangToggle() {
  const { i18n } = useTranslation();
  const isDE = i18n.language === "de";
  return (
    <button
      onClick={() => i18n.changeLanguage(isDE ? "en" : "de")}
      title={isDE ? "Switch to English" : "Zu Deutsch wechseln"}
      className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-bg-hover transition-colors shrink-0 text-xs font-bold text-text-muted hover:text-text-secondary"
    >
      {isDE ? "EN" : "DE"}
    </button>
  );
}

function NavItem({
  to,
  icon: Icon,
  label,
  onClick,
}: {
  to: string;
  icon: typeof LayoutDashboard;
  label: string;
  onClick?: () => void;
}) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
          isActive
            ? "text-[#22E8DC]"
            : "text-text-secondary hover:text-text-primary hover:bg-bg-hover"
        )
      }
      style={({ isActive }) =>
        isActive
          ? { background: "rgba(34,232,220,0.08)", border: "1px solid rgba(34,232,220,0.15)" }
          : {}
      }
    >
      {({ isActive }) => (
        <>
          <Icon className="w-4 h-4 shrink-0" style={isActive ? { color: "#22E8DC" } : {}} />
          <span className="flex-1">{label}</span>
          {isActive && (
            <motion.div
              layoutId="sidebar-dot"
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: "#22E8DC" }}
            />
          )}
        </>
      )}
    </NavLink>
  );
}

function SidebarContent({
  onNavClick,
}: {
  onNavClick?: () => void;
}) {
  const { user, clearAuth } = useAuthStore();
  const { theme, toggle } = useThemeStore();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try { await authApi.logout(); } catch { /* ignore */ }
    clearAuth();
    navigate("/login");
  };

  const navItems = [
    { to: "/dashboard",    icon: LayoutDashboard, label: t("nav.dashboard") },
    { to: "/repositories", icon: GitBranch,        label: t("nav.repositories") },
    { to: "/logs",         icon: ScrollText,        label: t("nav.logs") },
    { to: "/settings",     icon: Settings,          label: t("nav.settings") },
    { to: "/sessions",     icon: MonitorSmartphone, label: t("nav.sessions") },
  ];

  const adminItems = [
    { to: "/users", icon: Users,        label: t("nav.users") },
    { to: "/audit", icon: ClipboardList, label: t("nav.audit") },
    { to: "/queue", icon: ListChecks,   label: t("nav.queue") },
  ];

  return (
    <>
      {/* Header */}
      <div className="px-4 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: "rgba(34,232,220,0.08)",
              border: "1px solid rgba(34,232,220,0.2)",
              boxShadow: "0 0 12px rgba(34,232,220,0.1)",
            }}
          >
            <AppLogo />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-sm leading-tight text-text-primary">{t("app.name")}</p>
            <p className="text-xs mt-0.5 text-text-muted">{t("app.version")}</p>
          </div>
          <div className="flex items-center gap-0.5">
            <LangToggle />
            <button
              onClick={toggle}
              title={theme === "dark" ? "Light Mode" : "Dark Mode"}
              className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-bg-hover transition-colors shrink-0"
            >
              {theme === "dark" ? (
                <Sun className="w-3.5 h-3.5 text-text-muted" />
              ) : (
                <Moon className="w-3.5 h-3.5 text-text-muted" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2.5 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => (
          <NavItem key={item.to} {...item} onClick={onNavClick} />
        ))}

        {user?.role === "admin" && (
          <>
            <div className="pt-3 pb-1 px-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                {t("nav.admin")}
              </p>
            </div>
            {adminItems.map((item) => (
              <NavItem key={item.to} {...item} onClick={onNavClick} />
            ))}
          </>
        )}
      </nav>

      {/* User footer */}
      <div className="p-2.5 border-t border-border space-y-1">
        <div
          className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer hover:bg-bg-hover transition-colors"
          onClick={() => { navigate("/sessions"); onNavClick?.(); }}
          style={{ background: "rgba(255,255,255,0.03)" }}
        >
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
            style={{ background: "rgba(34,232,220,0.12)", border: "1px solid rgba(34,232,220,0.2)" }}
          >
            <User className="w-3.5 h-3.5" style={{ color: "#22E8DC" }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold truncate text-text-primary">{user?.username}</p>
            <p className="text-xs capitalize text-text-muted">{user?.role}</p>
          </div>
          <ChevronRight className="w-3 h-3 shrink-0 text-text-muted" />
        </div>

        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-all duration-200 text-text-secondary hover:text-accent-red hover:bg-accent-red/10"
        >
          <LogOut className="w-3.5 h-3.5" />
          {t("nav.logout")}
        </button>
      </div>
    </>
  );
}

const ROUTE_TITLE_KEYS: Record<string, string> = {
  dashboard:    "nav.dashboard",
  repositories: "nav.repositories",
  logs:         "nav.logs",
  settings:     "nav.settings",
  sessions:     "nav.sessions",
  users:        "nav.users",
  audit:        "nav.audit",
  queue:        "nav.queue",
};

export default function Layout() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();
  const { t } = useTranslation();

  useEffect(() => {
    const segment = location.pathname.split("/").filter(Boolean)[0] ?? "";
    const key = ROUTE_TITLE_KEYS[segment];
    document.title = key ? `${t(key)} – Hookshot` : "Hookshot";
  }, [location.pathname, t]);

  return (
    <div className="flex h-screen bg-bg-primary overflow-hidden">
      {/* ── Desktop sidebar ─────────────────────────────── */}
      <aside className="hidden md:flex w-60 bg-bg-secondary border-r border-border flex-col shrink-0">
        <SidebarContent />
      </aside>

      {/* ── Mobile drawer backdrop ───────────────────────── */}
      <AnimatePresence>
        {drawerOpen && (
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/60 z-40 md:hidden"
            onClick={() => setDrawerOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* ── Mobile drawer ────────────────────────────────── */}
      <AnimatePresence>
        {drawerOpen && (
          <motion.aside
            key="drawer"
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-y-0 left-0 z-50 w-72 bg-bg-secondary border-r border-border flex flex-col md:hidden"
          >
            <button
              onClick={() => setDrawerOpen(false)}
              className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-bg-hover transition-colors text-text-muted"
            >
              <X className="w-4 h-4" />
            </button>
            <SidebarContent onNavClick={() => setDrawerOpen(false)} />
          </motion.aside>
        )}
      </AnimatePresence>

      {/* ── Main content ─────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Mobile top bar */}
        <div className="flex md:hidden items-center h-12 px-4 bg-bg-secondary border-b border-border shrink-0 gap-3">
          <button
            onClick={() => setDrawerOpen(true)}
            className="p-1.5 rounded-lg hover:bg-bg-hover transition-colors text-text-secondary"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 flex-1">
            <svg width="16" height="16" viewBox="0 0 120 120" fill="none">
              <rect x="22" y="28" width="10" height="58" rx="4" fill="#22E8DC" />
              <rect x="22" y="51" width="36" height="10" rx="4" fill="#22E8DC" />
              <path d="M58 28 L58 56 L88 56 L88 28" stroke="#22E8DC" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              <path d="M88 56 L96 56 L96 64" stroke="#22E8DC" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              <line x1="81" y1="73" x2="95" y2="57" stroke="#22E8DC" strokeWidth="7" strokeLinecap="round" />
            </svg>
            <span className="font-bold text-sm text-text-primary">Hookshot</span>
          </div>
        </div>

        <main className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              className="h-full"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
