// WHY: templates remount on route change, so this div replays the page-enter animation on every
// navigation. Server component; plain block wrapper so min-h-dvh / h-dvh / sticky children keep
// their layout (no overflow or sizing of its own).
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
