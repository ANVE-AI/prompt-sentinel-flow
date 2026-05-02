import { useState } from "react";
import { Outlet } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Topbar } from "@/components/topbar";
import { CommandPalette } from "@/components/command-palette";
import { MobileSidebar } from "@/components/mobile-sidebar";
import { DashboardSidebar } from "@/components/dashboard-sidebar";

const DashboardLayout = () => {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <SidebarProvider defaultOpen>
      <div className="min-h-screen flex w-full bg-background">
        <DashboardSidebar />

        <MobileSidebar open={mobileOpen} onOpenChange={setMobileOpen} />
        <CommandPalette />

        <main className="flex-1 min-w-0 flex flex-col">
          <Topbar onMenuClick={() => setMobileOpen(true)} />
          <div className="flex-1 min-w-0">
            <Outlet />
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
};

export default DashboardLayout;
