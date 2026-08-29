import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth/auth.config";

// Next.js 16 renamed the `middleware` file convention to `proxy`. This runs on
// the Edge runtime before a request reaches any page, so it gets the *config
// only* — no Prisma, no bcrypt. It can still read and verify the session
// cookie, which is all the `authorized` callback needs.
const { auth } = NextAuth(authConfig);

// `auth` is itself a request handler: it verifies the cookie, runs `authorized`
// from auth.config, then redirects or lets the request through. Wrapping it in
// a declared function keeps the export statically detectable — Next.js cannot
// see a function through a destructured `const`.
export default function proxy(request: Parameters<typeof auth>[0]) {
  return auth(request);
}

export const config = {
  // Run on everything except Next.js internals, the auth API itself, and static
  // files. Matching /api/auth would block the very endpoint that signs users in.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico)$).*)",
  ],
};
