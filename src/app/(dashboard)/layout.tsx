import { cookies } from "next/headers";

import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { PageTitle } from "@/components/dashboard/page-title";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { getCurrentShop, requireUser } from "@/lib/auth/session";

const dateFormat = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });

export default async function DashboardLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const shop = await getCurrentShop();
  // Remember collapsed/expanded across reloads (cookie set by SidebarProvider).
  const sidebarOpen = (await cookies()).get("sidebar_state")?.value !== "false";

  return (
    <SidebarProvider defaultOpen={sidebarOpen}>
      <AppSidebar shopName={shop?.name ?? null} email={user.email} />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4 data-vertical:self-center" />
          <PageTitle />
          {shop?.plan === "trial" && shop.trialEndsAt && (
            <Badge variant="secondary" className="ml-auto">
              Trial ends {dateFormat.format(new Date(shop.trialEndsAt))}
            </Badge>
          )}
        </header>
        <div className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
