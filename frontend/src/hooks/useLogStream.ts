import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Opens an SSE connection to /api/logs/stream and invalidates the
 * ["logs"] query cache whenever a new log arrives.
 *
 * Security note: instead of passing the long-lived JWT directly in the URL
 * (where it would be captured by server access logs and browser history),
 * the hook first fetches a short-lived one-time stream token via an
 * authenticated POST request and uses that in the SSE URL.  The token is a
 * random UUID that expires in 30 seconds and is consumed on first use.
 *
 * @param onMessage  Optional callback fired on every incoming event —
 *                   use it to invalidate additional queries (e.g. ["stats"]).
 *
 * Returns `true` while the connection is OPEN so the UI can show a
 * live indicator.
 */
export function useLogStream(onMessage?: () => void): boolean {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  // Keep a stable ref so the effect doesn't re-run when the callback changes
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    const jwt = localStorage.getItem("token");
    if (!jwt) return;

    let active = true;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    async function connect() {
      if (!active) return;

      try {
        // Step 1: exchange the JWT for a short-lived one-time stream token.
        // The JWT stays in the Authorization header (not in a URL).
        const res = await fetch("/api/auth/stream-token", {
          method: "POST",
          headers: { Authorization: `Bearer ${jwt}` },
        });
        if (!res.ok || !active) return;

        const { token: streamToken } = (await res.json()) as { token: string };
        if (!active) return;

        // Step 2: open the SSE connection with the one-time token.
        // Even if this URL appears in logs, the token has already expired
        // or will expire within 30 seconds and cannot be reused.
        const es = new EventSource(
          `/api/logs/stream?token=${encodeURIComponent(streamToken)}`
        );
        esRef.current = es;

        es.onopen = () => {
          if (active) setConnected(true);
        };

        es.onmessage = () => {
          queryClient.invalidateQueries({ queryKey: ["logs"] });
          onMessageRef.current?.();
        };

        es.onerror = () => {
          // Close immediately — don't let EventSource auto-retry with the
          // same (now-expired / already-consumed) token.
          es.close();
          esRef.current = null;
          if (active) {
            setConnected(false);
            // Reconnect after 5 s with a freshly issued stream token.
            retryTimer = setTimeout(connect, 5_000);
          }
        };
      } catch {
        // Network error fetching the stream token — retry later.
        if (active) {
          retryTimer = setTimeout(connect, 5_000);
        }
      }
    }

    connect();

    return () => {
      active = false;
      if (retryTimer !== null) clearTimeout(retryTimer);
      esRef.current?.close();
      esRef.current = null;
      setConnected(false);
    };
  }, [queryClient]); // onMessage intentionally omitted — handled via ref

  return connected;
}
