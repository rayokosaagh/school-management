import CredentialProvider from "next-auth/providers/credentials";
import NextAuth from "next-auth";
import bcrypt from "bcryptjs";
import { authConfig } from "./auth.config";
import { normalizeEmail } from "./identity";
import { prisma } from "@/lib/prisma";

// A real bcrypt hash of a throwaway string, at the same cost factor (10) the
// signup path uses. When no account matches we compare against this instead of
// returning early, so both outcomes spend the same ~100ms and the response time
// stops revealing which identifiers are real.
const DUMMY_HASH = "$2b$10$DNFhqPQcyhBC3dF.Il31AeZWv8c2YqKakmhhRRoQKubxJNWljZZGG";

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    CredentialProvider({
      // One field accepting either form. Named `identifier` rather than
      // `username` so the wire format says what it actually carries.
      credentials: { identifier: {}, password: {} },
      authorize: async (credentials) => {
        const identifier = credentials?.identifier;
        const password = credentials?.password;

        // `credentials` arrives as unknown values off the wire — a client can
        // post anything. Narrow before touching the database.
        if (typeof identifier !== "string" || typeof password !== "string") {
          return null;
        }

        const trimmed = identifier.trim();
        if (!trimmed) return null;

        // A single OR query rather than sniffing for "@" first: no heuristic to
        // get wrong, and a username that happens to look like an email still
        // resolves. Both columns are uniquely indexed, so at most one row wins.
        const user = await prisma.user.findFirst({
          where: {
            OR: [{ username: trimmed }, { email: normalizeEmail(trimmed) }],
          },
        });

        const isMatch = await bcrypt.compare(
          password,
          user?.passwordHash ?? DUMMY_HASH,
        );

        // Both halves are checked, and both failures return the same value, so
        // the caller cannot tell a bad identifier from a bad password.
        if (!user || !isMatch) return null;

        // NextAuth types User.id as string; the column is an Int.
        return { id: String(user.id), username: user.username, role: user.role };
      },
    }),
  ],
});
