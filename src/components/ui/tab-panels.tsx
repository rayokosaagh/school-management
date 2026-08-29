"use client";

import type { ReactNode } from "react";
import { Tabs } from "@base-ui/react/tabs";
import { cn } from "@/lib/utils";

// Two jobs on one page get a tab each rather than stacking into a long scroll.

export type TabPanel = { value: string; label: string; content: ReactNode };

export function TabPanels({
  tabs,
  defaultValue,
  className,
}: {
  tabs: TabPanel[];
  defaultValue?: string;
  className?: string;
}) {
  return (
    <Tabs.Root defaultValue={defaultValue ?? tabs[0]?.value} className={className}>
      <Tabs.List className="border-border/60 mb-5 flex gap-1 border-b">
        {tabs.map((tab) => (
          <Tabs.Tab
            key={tab.value}
            value={tab.value}
            className={cn(
              "focus-visible:ring-ring/50 -mb-px cursor-pointer rounded-t-lg border-b-2 px-3 py-2 text-sm transition-colors focus-visible:ring-3 focus-visible:outline-none",
              "text-muted-foreground hover:text-foreground border-transparent",
              "data-[active]:border-action data-[active]:text-foreground data-[active]:font-medium",
            )}
          >
            {tab.label}
          </Tabs.Tab>
        ))}
      </Tabs.List>

      {tabs.map((tab) => (
        <Tabs.Panel
          key={tab.value}
          value={tab.value}
          className="space-y-6 outline-none"
        >
          {tab.content}
        </Tabs.Panel>
      ))}
    </Tabs.Root>
  );
}
