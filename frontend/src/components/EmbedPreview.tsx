import type { EmbedTemplate } from "../types";
import { colorToHex } from "../lib/utils";

interface EmbedPreviewProps {
  template: EmbedTemplate;
}

const PREVIEW_VARS: Record<string, string> = {
  "{{repo_name}}": "MilitaryRP",
  "{{repo_full_name}}": "Good-Gaming-Community/MilitaryRP",
  "{{repo_url}}": "https://github.com/Good-Gaming-Community/MilitaryRP",
  "{{pusher_name}}": "DevUser42",
  "{{pusher_avatar}}": "https://github.com/identicons/devuser42.png",
  "{{branch}}": "main",
  "{{commit_count}}": "3",
  "{{added_commits}}":
    "[`a1b2c3d`](https://github.com/org/repo/commit/a1b2c3d) - feat: add new map - DevUser42",
  "{{modified_commits}}":
    "[`e4f5g6h`](https://github.com/org/repo/commit/e4f5g6h) - fix: update config - DevUser42\n[`i7j8k9l`](https://github.com/org/repo/commit/i7j8k9l) - chore: cleanup - DevUser42",
  "{{removed_commits}}": "",
  "{{all_commits}}":
    "[`a1b2c3d`](https://github.com/org/repo/commit/a1b2c3d) - feat: add new map - DevUser42",
  "{{discord_timestamp_t}}": "<t:1748000000:t>",
  "{{discord_timestamp_T}}": "<t:1748000000:T>",
  "{{discord_timestamp_d}}": "<t:1748000000:d>",
  "{{discord_timestamp_D}}": "<t:1748000000:D>",
  "{{discord_timestamp_f}}": "<t:1748000000:f>",
  "{{discord_timestamp_F}}": "<t:1748000000:F>",
  "{{discord_timestamp_R}}": "<t:1748000000:R>",
};

function resolveVars(text: string): string {
  let result = text;
  for (const [key, val] of Object.entries(PREVIEW_VARS)) {
    result = result.split(key).join(val);
  }
  return result;
}

function renderMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[(`[^`]+`)\]\(([^)]+)\)/g, '<a href="$2" class="text-accent-blue hover:underline">$1</a>')
    .replace(/`([^`]+)`/g, '<code class="bg-black/30 px-1 rounded text-xs font-mono">$1</code>')
    .replace(/\n/g, "<br />");
}

export default function EmbedPreview({ template }: EmbedPreviewProps) {
  const borderColor = colorToHex(template.color ?? 2287836);

  const title = template.title ? resolveVars(template.title) : undefined;
  const description = template.description ? resolveVars(template.description) : undefined;
  const url = template.url ? resolveVars(template.url) : undefined;
  const footerText = template.footer_text ? resolveVars(template.footer_text) : undefined;
  const footerIconUrl = template.footer_icon_url
    ? resolveVars(template.footer_icon_url)
    : undefined;
  const thumbnailUrl = template.thumbnail_url ? resolveVars(template.thumbnail_url) : undefined;
  const imageUrl = template.image_url ? resolveVars(template.image_url) : undefined;
  const authorName = template.author_name ? resolveVars(template.author_name) : undefined;
  const authorIconUrl = template.author_icon_url
    ? resolveVars(template.author_icon_url)
    : undefined;

  return (
    <div className="bg-discord-bg rounded-lg p-4 font-sans">
      <p className="text-xs text-text-muted mb-3 uppercase tracking-wide font-semibold">
        Embed Vorschau
      </p>
      <div
        className="relative rounded overflow-hidden bg-discord-embed pl-3"
        style={{ borderLeft: `4px solid ${borderColor}` }}
      >
        <div className="p-3 pr-4">
          <div className="flex gap-3">
            <div className="flex-1 min-w-0">
              {authorName && (
                <div className="flex items-center gap-1.5 mb-1.5">
                  {authorIconUrl && (
                    <img
                      src={authorIconUrl}
                      className="w-4 h-4 rounded-full"
                      onError={(e) => (e.currentTarget.style.display = "none")}
                      alt=""
                    />
                  )}
                  <span className="text-xs font-semibold text-text-primary">{authorName}</span>
                </div>
              )}

              {title && (
                <p className="font-semibold text-sm text-accent-blue hover:underline cursor-pointer mb-1.5">
                  {url ? (
                    <a href={url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      {title}
                    </a>
                  ) : (
                    title
                  )}
                </p>
              )}

              {description && (
                <div
                  className="text-xs text-[#dcddde] leading-relaxed mb-2 whitespace-pre-wrap"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(description) }}
                />
              )}

              {imageUrl && (
                <div className="mt-2 mb-2">
                  <img
                    src={imageUrl}
                    className="max-w-full rounded max-h-64 object-cover"
                    onError={(e) => (e.currentTarget.style.display = "none")}
                    alt="embed image"
                  />
                </div>
              )}

              {(footerText || template.use_timestamp) && (
                <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-white/5">
                  {footerIconUrl && (
                    <img
                      src={footerIconUrl}
                      className="w-4 h-4 rounded-full"
                      onError={(e) => (e.currentTarget.style.display = "none")}
                      alt=""
                    />
                  )}
                  <div className="flex items-center gap-1 text-[10px] text-[#72767d]">
                    {footerText && <span>{footerText}</span>}
                    {footerText && template.use_timestamp && <span>•</span>}
                    {template.use_timestamp && <span>Heute um 16:20</span>}
                  </div>
                </div>
              )}
            </div>

            {thumbnailUrl && (
              <div className="shrink-0">
                <img
                  src={thumbnailUrl}
                  className="w-16 h-16 rounded object-cover"
                  onError={(e) => (e.currentTarget.style.display = "none")}
                  alt="thumbnail"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <div
          className="w-3 h-3 rounded-sm border border-white/20"
          style={{ backgroundColor: borderColor }}
        />
        <span className="text-xs text-text-muted font-mono">{borderColor.toUpperCase()}</span>
      </div>
    </div>
  );
}
