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
      // Cookies with a __Secure-/__Host- prefix are only accepted by the
      // browser (even for deletion) when the Secure attribute is present —
      // omitting it makes the browser silently ignore the Set-Cookie.
      store.delete({
        name: c.name,
        path: "/",
        secure: c.name.startsWith("__Secure-") || c.name.startsWith("__Host-"),
      });
    }
  }
  return new NextResponse(null, { status: 204 });
}
