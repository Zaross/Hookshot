import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Info, Check } from "lucide-react";
import { EMBED_VARIABLES } from "../types";

interface VariablePickerProps {
  onInsert: (variable: string) => void;
}

export default function VariablePicker({ onInsert }: VariablePickerProps) {
  const [open, setOpen] = useState(true);
  const [hovered, setHovered] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const handleClick = (key: string) => {
    onInsert(key);
    navigator.clipboard.writeText(key).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied((prev) => (prev === key ? null : prev)), 1500);
  };

  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-bg-hover transition-colors"
      >
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-text-primary">Verfügbare Variablen</span>
        </div>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="w-4 h-4 text-text-secondary" />
        </motion.div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4">
              <p className="text-xs text-text-muted mb-3">
                Klicke auf eine Variable — wird eingefügt & in die Zwischenablage kopiert
              </p>
              <div className="flex flex-wrap gap-2">
                {EMBED_VARIABLES.map((v) => (
                  <motion.button
                    key={v.key}
                    type="button"
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => handleClick(v.key)}
                    onMouseEnter={() => setHovered(v.key)}
                    onMouseLeave={() => setHovered(null)}
                    className="relative inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono font-medium bg-accent-amber/10 text-accent-amber border border-accent-amber/20 hover:bg-accent-amber/20 transition-colors cursor-pointer"
                  >
                    {copied === v.key ? (
                      <Check className="w-3 h-3 shrink-0" />
                    ) : null}
                    {v.label}
                    <AnimatePresence>
                      {hovered === v.key && copied !== v.key && (
                        <motion.div
                          initial={{ opacity: 0, y: 4, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 4, scale: 0.95 }}
                          transition={{ duration: 0.15 }}
                          className="absolute bottom-full left-0 mb-2 z-50 bg-bg-primary border border-border rounded-lg p-2 shadow-xl min-w-[160px]"
                        >
                          <p className="text-xs font-mono text-accent-amber mb-1">{v.key}</p>
                          <p className="text-xs text-text-secondary">{v.desc}</p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
