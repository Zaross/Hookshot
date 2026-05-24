import { useRef, useState, useCallback, memo } from "react";
import { motion } from "framer-motion";
import { Eye, EyeOff, Palette, Type, Image, User } from "lucide-react";
import type { EmbedTemplate } from "../types";
import { colorToHex, hexToColor } from "../lib/utils";
import EmbedPreview from "./EmbedPreview";
import VariablePicker from "./VariablePicker";
import { cn } from "../lib/utils";

interface EmbedBuilderProps {
  value: EmbedTemplate;
  onChange: (template: EmbedTemplate) => void;
}

type FocusedField =
  | "title"
  | "description"
  | "url"
  | "footer_text"
  | "footer_icon_url"
  | "thumbnail_url"
  | "image_url"
  | "author_name"
  | "author_url"
  | "author_icon_url"
  | null;

// Defined outside component so React never sees a new type on re-render
const Section = memo(function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center gap-2 text-text-secondary">
        <Icon className="w-4 h-4 text-primary" />
        <span className="text-sm font-semibold">{title}</span>
      </div>
      {children}
    </div>
  );
});

const HighlightTextarea = memo(function HighlightTextarea({
  value,
  onChange,
  onFocus,
  placeholder,
  rows = 3,
  inputRef,
}: {
  value: string;
  onChange: (v: string) => void;
  onFocus: () => void;
  placeholder?: string;
  rows?: number;
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const localRef = useRef<HTMLTextAreaElement>(null);
  const ref = inputRef ?? localRef;

  return (
    <textarea
      ref={ref as React.RefObject<HTMLTextAreaElement>}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onFocus={onFocus}
      placeholder={placeholder}
      rows={rows}
      className="w-full bg-bg-secondary border border-border rounded-lg p-3 text-sm font-mono text-text-primary placeholder-text-muted resize-none focus:outline-none focus:border-primary transition-colors"
    />
  );
});

const HighlightInput = memo(function HighlightInput({
  value,
  onChange,
  onFocus,
  placeholder,
  inputRef,
}: {
  value: string;
  onChange: (v: string) => void;
  onFocus: () => void;
  placeholder?: string;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <input
      ref={inputRef as React.RefObject<HTMLInputElement>}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onFocus={onFocus}
      placeholder={placeholder}
      className="input font-mono"
    />
  );
});

export default function EmbedBuilder({ value, onChange }: EmbedBuilderProps) {
  const [showPreview, setShowPreview] = useState(true);
  const [focusedField, setFocusedField] = useState<FocusedField>(null);

  const titleRef = useRef<HTMLInputElement | null>(null);
  const descRef = useRef<HTMLTextAreaElement | null>(null);
  const urlRef = useRef<HTMLInputElement | null>(null);
  const footerTextRef = useRef<HTMLInputElement | null>(null);
  const footerIconRef = useRef<HTMLInputElement | null>(null);
  const thumbRef = useRef<HTMLInputElement | null>(null);
  const imageRef = useRef<HTMLInputElement | null>(null);
  const authorNameRef = useRef<HTMLInputElement | null>(null);
  const authorUrlRef = useRef<HTMLInputElement | null>(null);
  const authorIconRef = useRef<HTMLInputElement | null>(null);

  // Stable ref map — never recreated
  const refMap = useRef<Record<NonNullable<FocusedField>, React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>>>({
    title: titleRef,
    description: descRef,
    url: urlRef,
    footer_text: footerTextRef,
    footer_icon_url: footerIconRef,
    thumbnail_url: thumbRef,
    image_url: imageRef,
    author_name: authorNameRef,
    author_url: authorUrlRef,
    author_icon_url: authorIconRef,
  });

  // Keep latest value accessible in callbacks without adding it as a dependency
  const valueRef = useRef(value);
  valueRef.current = value;

  const update = useCallback(
    (key: keyof EmbedTemplate, val: EmbedTemplate[keyof EmbedTemplate]) => {
      onChange({ ...valueRef.current, [key]: val });
    },
    [onChange]
  );

  const insertVariable = useCallback(
    (variable: string) => {
      if (!focusedField) return;
      const ref = refMap.current[focusedField];
      const el = ref.current;
      if (!el) return;

      const start = el.selectionStart ?? 0;
      const end = el.selectionEnd ?? 0;
      const current = (valueRef.current[focusedField] as string) ?? "";
      const next = current.slice(0, start) + variable + current.slice(end);

      update(focusedField as keyof EmbedTemplate, next);

      requestAnimationFrame(() => {
        el.focus();
        const pos = start + variable.length;
        el.setSelectionRange(pos, pos);
      });
    },
    [focusedField, update]
  );

  const colorHex = colorToHex(value.color ?? 2287836);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">Embed Builder</h3>
        <button
          onClick={() => setShowPreview((v) => !v)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border",
            showPreview
              ? "bg-primary/10 text-primary border-primary/20"
              : "bg-bg-hover text-text-secondary border-border"
          )}
        >
          {showPreview ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          Vorschau
        </button>
      </div>

      <div className={cn("grid gap-4", showPreview ? "grid-cols-2" : "grid-cols-1")}>
        <div className="space-y-4">
          <Section icon={Type} title="Inhalt">
            <div>
              <label className="label">Titel</label>
              <HighlightInput
                inputRef={titleRef}
                value={value.title ?? ""}
                onChange={(v) => update("title", v)}
                onFocus={() => setFocusedField("title")}
                placeholder="{{repo_name}}"
              />
            </div>
            <div>
              <label className="label">Beschreibung</label>
              <HighlightTextarea
                inputRef={descRef}
                value={value.description ?? ""}
                onChange={(v) => update("description", v)}
                onFocus={() => setFocusedField("description")}
                placeholder="**🚀 Hinzugefügt:**&#10;{{added_commits}}"
                rows={6}
              />
            </div>
            <div>
              <label className="label">URL (Titel-Link)</label>
              <HighlightInput
                inputRef={urlRef}
                value={value.url ?? ""}
                onChange={(v) => update("url", v)}
                onFocus={() => setFocusedField("url")}
                placeholder="{{repo_url}}"
              />
            </div>
          </Section>

          <Section icon={Palette} title="Farbe & Zeitstempel">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 flex-1">
                <input
                  type="color"
                  value={colorHex}
                  onChange={(e) => update("color", hexToColor(e.target.value))}
                  className="w-10 h-10 rounded-lg border border-border bg-transparent cursor-pointer"
                />
                <input
                  type="text"
                  value={colorHex}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (/^#[0-9a-fA-F]{0,6}$/.test(v)) update("color", hexToColor(v.padEnd(7, "0")));
                  }}
                  className="input font-mono uppercase"
                  placeholder="#1AC93C"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="use_timestamp"
                checked={value.use_timestamp ?? false}
                onChange={(e) => update("use_timestamp", e.target.checked)}
                className="w-4 h-4 accent-primary"
              />
              <label htmlFor="use_timestamp" className="text-sm text-text-secondary cursor-pointer">
                Zeitstempel anzeigen (Discord lokale Zeit)
              </label>
            </div>
          </Section>

          <Section icon={User} title="Autor & Footer">
            <div>
              <label className="label">Autor Name</label>
              <HighlightInput
                inputRef={authorNameRef}
                value={value.author_name ?? ""}
                onChange={(v) => update("author_name", v)}
                onFocus={() => setFocusedField("author_name")}
                placeholder="{{pusher_name}}"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Autor URL</label>
                <HighlightInput
                  inputRef={authorUrlRef}
                  value={value.author_url ?? ""}
                  onChange={(v) => update("author_url", v)}
                  onFocus={() => setFocusedField("author_url")}
                  placeholder="{{repo_url}}"
                />
              </div>
              <div>
                <label className="label">Autor Icon URL</label>
                <HighlightInput
                  inputRef={authorIconRef}
                  value={value.author_icon_url ?? ""}
                  onChange={(v) => update("author_icon_url", v)}
                  onFocus={() => setFocusedField("author_icon_url")}
                  placeholder="{{pusher_avatar}}"
                />
              </div>
            </div>
            <div>
              <label className="label">Footer Text</label>
              <HighlightInput
                inputRef={footerTextRef}
                value={value.footer_text ?? ""}
                onChange={(v) => update("footer_text", v)}
                onFocus={() => setFocusedField("footer_text")}
                placeholder="{{pusher_name}}"
              />
            </div>
            <div>
              <label className="label">Footer Icon URL</label>
              <HighlightInput
                inputRef={footerIconRef}
                value={value.footer_icon_url ?? ""}
                onChange={(v) => update("footer_icon_url", v)}
                onFocus={() => setFocusedField("footer_icon_url")}
                placeholder="{{pusher_avatar}}"
              />
            </div>
          </Section>

          <Section icon={Image} title="Bilder">
            <div>
              <label className="label">Thumbnail URL (oben rechts)</label>
              <HighlightInput
                inputRef={thumbRef}
                value={value.thumbnail_url ?? ""}
                onChange={(v) => update("thumbnail_url", v)}
                onFocus={() => setFocusedField("thumbnail_url")}
                placeholder="https://..."
              />
            </div>
            <div>
              <label className="label">Bild URL (groß, unten)</label>
              <HighlightInput
                inputRef={imageRef}
                value={value.image_url ?? ""}
                onChange={(v) => update("image_url", v)}
                onFocus={() => setFocusedField("image_url")}
                placeholder="https://..."
              />
            </div>
          </Section>

          <VariablePicker onInsert={insertVariable} />
        </div>

        {showPreview && (
          <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            className="sticky top-6 self-start"
          >
            <EmbedPreview template={value} />
          </motion.div>
        )}
      </div>
    </div>
  );
}
