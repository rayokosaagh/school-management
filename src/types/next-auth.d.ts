import type { DefaultSession } from "next-auth";
import type { Role } from "@/generated/prisma/enums";

// NextAuth ships its own User/Session/JWT shapes. Returning extra fields from
// `authorize` does not widen those types on its own — TypeScript would reject
// `session.user.username`. Declaration merging adds our fields to the library's
// existing interfaces so the whole app sees them.

declare module "next-auth" {
  interface User {
    username?: string;
    role?: Role;
  }

  interface Session {
    user: {
      id: string;
      username: string;
      role: Role;
    } & DefaultSession["user"];
  }
}

// `next-auth/jwt` only re-exports from `@auth/core/jwt`, and declaration
// merging has to name the module that actually declares the interface —
// augmenting the re-export silently does nothing.
declare module "@auth/core/jwt" {
  interface JWT {
    id?: string;
    username?: string;
    role?: Role;
  }
}
