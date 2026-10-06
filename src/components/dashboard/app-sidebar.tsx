"use client";

import { ChevronsUpDown, CreditCard, LogOut, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";

import { signOut } from "@/app/(auth)/actions";
import { activeNavItem, NAV_GROUPS } from "@/components/dashboard/nav";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";

type AppSidebarProps = {
  shopName: string | null;
  email: string;
  /** False shows a dot on Store until Shopify is connected. */
  storeConnected: boolean;
  /** Items waiting for a person, shown as counts next to the nav items. */
  counts?: { escalations: number; approvals: number };
};

function initials(name: string): string {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "");
  return letters.join("") || "?";
}

export function AppSidebar({ shopName, email, storeConnected, counts }: AppSidebarProps) {
  const pathname = usePathname();
  const active = activeNavItem(pathname);
  const { isMobile, setOpenMobile } = useSidebar();
  const router = useRouter();
  const [signingOut, startSignOut] = useTransition();

  const displayName = shopName ?? "No store";

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              render={<Link href="/home" />}
              tooltip="DeskPilot"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
                D
              </span>
              <span className="flex flex-col leading-tight">
                <span className="font-semibold">DeskPilot</span>
                <span className="text-xs text-muted-foreground">{displayName}</span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {NAV_GROUPS.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const isActive = active?.href === item.href;
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        isActive={isActive}
                        tooltip={item.title}
                        render={
                          <Link
                            href={item.href}
                            aria-current={isActive ? "page" : undefined}
                            onClick={() => isMobile && setOpenMobile(false)}
                          />
                        }
                      >
                        <item.icon aria-hidden />
                        <span>{item.title}</span>
                        {(() => {
                          const n = item.href === "/escalations" ? counts?.escalations : item.href === "/approvals" ? counts?.approvals : 0;
                          return n ? (
                            <span
                              className="ml-auto rounded-full bg-destructive px-1.5 text-xs font-medium text-white tabular-nums"
                              aria-label={`${n} waiting`}
                            >
                              {n > 99 ? "99+" : n}
                            </span>
                          ) : null;
                        })()}
                        {item.href === "/store" && !storeConnected && (
                          <span className="ml-auto size-2 shrink-0 rounded-full bg-primary" aria-label="Not connected yet" />
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton
                    size="lg"
                    className="data-popup-open:bg-sidebar-accent"
                  />
                }
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                  {initials(displayName)}
                </span>
                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span className="truncate font-medium">{displayName}</span>
                  <span className="truncate text-xs text-muted-foreground">{email}</span>
                </span>
                <ChevronsUpDown className="ml-auto" aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side={isMobile ? "bottom" : "right"}
                align="end"
                className="min-w-56"
              >
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="truncate">{email}</DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={() => router.push("/settings")}>
                    <Settings aria-hidden />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => router.push("/billing")}>
                    <CreditCard aria-hidden />
                    Billing
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={signingOut}
                  onClick={() => startSignOut(() => signOut())}
                >
                  <LogOut aria-hidden />
                  {signingOut ? "Signing out…" : "Sign out"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
