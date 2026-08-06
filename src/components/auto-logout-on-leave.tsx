"use client";

import { useEffect } from "react";

// Logs the user out the moment they actually leave the page (closing the
// tab/browser, navigating to another site, or refreshing) rather than
// staying signed in indefinitely. `pagehide` only fires on real document
// unload, so in-app client-side navigation (Link/router.push) never
// triggers it.
export function AutoLogoutOnLeave() {
  useEffect(() => {
    function handlePageHide() {
      navigator.sendBeacon("/api/auth/beacon-signout");
    }
    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, []);

  return null;
}
