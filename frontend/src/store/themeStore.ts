import { create } from "zustand";

type Theme = "dark" | "light";

interface ThemeStore {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
}

function applyTheme(theme: Theme) {
  if (theme === "light") {
    document.documentElement.classList.add("light");
  } else {
    document.documentElement.classList.remove("light");
  }
}

const stored = (localStorage.getItem("theme") as Theme) ?? "dark";
applyTheme(stored);

export const useThemeStore = create<ThemeStore>((set) => ({
  theme: stored,
  toggle: () =>
    set((s) => {
      const next: Theme = s.theme === "dark" ? "light" : "dark";
      localStorage.setItem("theme", next);
      applyTheme(next);
      return { theme: next };
    }),
  setTheme: (t) => {
    localStorage.setItem("theme", t);
    applyTheme(t);
    set({ theme: t });
  },
}));
