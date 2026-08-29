import { MorphingSquare } from "@/components/ui/morphing-square";

// Next.js renders this automatically while a dashboard segment's server
// component is still resolving — the settings page waits on a database read,
// so this is what fills that gap instead of a blank pane.
export default function DashboardLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <MorphingSquare
        className="h-8 w-8 bg-muted-foreground"
        message="Loading"
      />
    </div>
  );
}
