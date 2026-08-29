import type { NextAuthConfig } from "next-auth";

// Routes a signed-out visitor is allowed to reach. Everything else requires a
// session. Keeping this as an allow-list means a new page is protected by
// default — forgetting to list it fails closed, not open.
const PUBLIC_ROUTES = ["/login", "/signup"];

// This file must stay free of Prisma, bcrypt, and anything else with a Node
// dependency: middleware runs on the Edge runtime, which has no such APIs.
// The database-backed provider lives in auth.ts and is added there instead.
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = Boolean(auth?.user);
      const isPublic = PUBLIC_ROUTES.some((route) =>
        nextUrl.pathname.startsWith(route),
      );

      if (isPublic) {
        // A signed-in user has no reason to see the login form again.
        if (isLoggedIn) {
          return Response.redirect(new URL("/dashboard/students", nextUrl));
        }
        return true;
      }

      // Signed-in only. Permission is decided per page against the stored
      // matrix — middleware runs on the Edge with no database, and the token
      // predates any permission change, so it cannot be trusted for this.
      return isLoggedIn;
    },

    // `user` is only present on the request where sign-in actually happened.
    // Whatever we copy onto the token here is what persists in the cookie.
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.username = user.username;
        token.role = user.role;
      }
      return token;
    },

    // The token is server-side only; this copies the fields the app is allowed
    // to read back out onto the session object components receive.
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id ?? "";
        session.user.username = token.username ?? "";
        session.user.role = token.role ?? "TEACHER";
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
