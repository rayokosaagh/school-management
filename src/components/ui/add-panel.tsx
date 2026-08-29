import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { AddPanelShell } from "@/components/ui/add-panel-shell";
import { IconTile, type Tint } from "@/components/ui/page-shell";

// Entry forms are collapsed by default. They are used now and then, but they
// were taking the top third of every page and pushing the records below the fold.
//
// This half stays a server component so the icon is rendered here; only the
// finished element is handed to the client shell.
export function AddPanel({
  icon,
  tint = "green",
  title,
  description,
  cta,
  children,
  defaultOpen = false,
}: {
  icon: LucideIcon;
  tint?: Tint;
  title: string;
  description?: ReactNode;
  cta: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <AddPanelShell
      cta={cta}
      defaultOpen={defaultOpen}
      header={
        <>
          <IconTile icon={icon} tint={tint} />
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">{title}</h2>
            {description ? (
              <p className="text-muted-foreground mt-0.5 text-sm">{description}</p>
            ) : null}
          </div>
        </>
      }
    >
      {children}
    </AddPanelShell>
  );
}
