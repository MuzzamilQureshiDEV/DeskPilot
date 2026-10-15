/** A gentle fade-in on every dashboard page change (skipped for people who prefer reduced motion). */
export default function DashboardTemplate({ children }: { children: React.ReactNode }) {
  return <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-300">{children}</div>;
}
