import { NextResponse } from "next/server";
import { cookies } from "next/headers";

// Called via navigator.sendBeacon when the page unloads (tab close, refresh,
// or navigating away from the site) to clear the session cookie so the user
// isn't left logged in indefinitely. In-app client-side navigation does not
// unload the document, so it never triggers this.
export async function POST() {
  const store = await cookies();
  for (const c of store.getAll()) {
    if (c.name.includes("session-token")) {
      store.delete(c.name);
    }
  }
  return new NextResponse(null, { status: 204 });
}
