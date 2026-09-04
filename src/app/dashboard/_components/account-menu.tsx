"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useState } from "react";
import { LogOut, Moon, Sun } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { applyTheme, currentTheme } from "@/lib/theme/theme";
import { MOBILE_IDS, SETTINGS, visibleGroups } from "./nav-model";

export function AccountMenu({
  username,
  roleLabel,
  allowed,
}: {
  username: string;
  roleLabel: string;
  allowed: string[];
}) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  // Pages the bottom bar cannot show; the menu is where they live on a phone.
  const overflow = visibleGroups(allowed)
    .flatMap((g) => g.items)
    .filter((i) => !MOBILE_IDS.includes(i.id));

  async function logOut() {
    setSigningOut(true);
    // redirect: false keeps NextAuth from doing a hard document navigation, so
    // the client router stays in charge and the cache is cleared properly.
    await signOut({ redirect: false });
    router.push("/login");
    router.refresh();
  }

  function toggleTheme() {
    applyTheme(currentTheme() === "dark" ? "light" : "dark");
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Account menu: ${username}, ${roleLabel}`}
          // Only earns its place on narrow screens, where it is the sole way to
          // reach the rail items the bottom bar cannot fit. From `shell` up the
          // rail shows Settings and the top bar has its own theme toggle and
          // sign-out, so the avatar would be a third route to nothing new.
          className="bg-brand-tint-2 text-brand-text focus-visible:ring-ring/50 ml-1 grid size-[30px] place-items-center rounded-full text-xs font-semibold uppercase focus-visible:ring-3 focus-visible:outline-none shell:hidden"
        >
          {username.slice(0, 2)}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="flex flex-col">
            <span className="truncate font-medium">{username}</span>
            <span className="text-ink-3 text-xs font-normal">{roleLabel}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {overflow.length > 0 ? (
            <>
              <DropdownMenuGroup className="shell:hidden">
                {overflow.map((item) => {
                  const Icon = item.icon;
                  return (
                    <DropdownMenuItem
                      key={item.id}
                      render={<Link href={item.href} />}
                    >
                      <Icon className="size-4" aria-hidden="true" />
                      {item.label}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuGroup>
              <DropdownMenuSeparator className="shell:hidden" />
            </>
          ) : null}
          {allowed.includes(SETTINGS.id) ? (
            <DropdownMenuItem render={<Link href={SETTINGS.href} />}>
              <SETTINGS.icon className="size-4" aria-hidden="true" />
              Settings
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onClick={toggleTheme}>
            <Sun className="size-4 dark:hidden" aria-hidden="true" />
            <Moon className="hidden size-4 dark:block" aria-hidden="true" />
            Switch theme
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={logOut} disabled={signingOut}>
            <LogOut className="size-4" aria-hidden="true" />
            {signingOut ? "Signing out…" : "Sign out"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <button
        type="button"
        onClick={logOut}
        disabled={signingOut}
        aria-label={signingOut ? "Signing out" : "Sign out"}
        title="Sign out"
        className="text-ink-2 hover:bg-page focus-visible:ring-ring/50 inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium transition-colors focus-visible:ring-3 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
      >
        <LogOut className="size-4" aria-hidden="true" />
        <span className="hidden shell:inline">
          {signingOut ? "Signing out..." : "Sign out"}
        </span>
      </button>
    </>
  );
}
