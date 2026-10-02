import {
  CreditCard,
  FlaskConical,
  GraduationCap,
  Inbox,
  LayoutDashboard,
  type LucideIcon,
  Settings,
  ShieldCheck,
  Store,
  TriangleAlert,
  Workflow,
} from "lucide-react";

export type NavItem = { title: string; href: string; icon: LucideIcon };
export type NavGroup = { label: string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [{ title: "Home", href: "/home", icon: LayoutDashboard }],
  },
  {
    label: "Support",
    items: [
      { title: "Inbox", href: "/inbox", icon: Inbox },
      { title: "Approvals", href: "/approvals", icon: ShieldCheck },
      { title: "Escalations", href: "/escalations", icon: TriangleAlert },
    ],
  },
  {
    label: "Agent",
    items: [
      { title: "Train", href: "/train", icon: GraduationCap },
      { title: "Test", href: "/test", icon: FlaskConical },
      { title: "Automation", href: "/automation", icon: Workflow },
    ],
  },
  {
    label: "Account",
    items: [
      { title: "Store", href: "/store", icon: Store },
      { title: "Settings", href: "/settings", icon: Settings },
      { title: "Billing", href: "/billing", icon: CreditCard },
    ],
  },
];

/** The nav item a pathname belongs to (`/inbox/123` → Inbox). */
export function activeNavItem(pathname: string): NavItem | undefined {
  return NAV_GROUPS.flatMap((g) => g.items).find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
}
