"use client";

import { useEffect } from "react";

// Session cookies are short-lived (see auth.ts); each hit to the built-in
// NextAuth session endpoint slides the expiry forward. As long as this tab
// stays open it keeps renewing itself, so the user stays logged in while
// present. If the tab is closed (or the browser crashes, the laptop dies,
// etc.) the pings simply stop and the cookie lapses on its own shortly
// after — no reliance on an unload event firing, so nothing to block.
const HEARTBEAT_INTERVAL_MS = 60_000;

export function SessionHeartbeat() {
  useEffect(() => {
    function ping() {
      fetch("/api/auth/session", { cache: "no-store" }).catch(() => {});
    }
    ping();
    const id = setInterval(ping, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return null;
}
