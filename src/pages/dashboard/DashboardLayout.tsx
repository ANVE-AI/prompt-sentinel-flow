import { useState } from "react";
import { Outlet } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Topbar } from "@/components/topbar";
import { CommandPalette } from "@/components/command-palette";
import { MobileSidebar } from "@/components/mobile-sidebar";
import { DashboardSidebar } from "@/components/dashboard-sidebar";

const SIDEBAR_STORAGE_KEY = "dashboard:sidebar:open";

const DashboardLayout = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    try {
      return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) !== "false";
    } catch {
      return true;
    }
  });

  const handleSidebarOpenChange = (open: boolean) => {
    setSidebarOpen(open);
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(open));
    } catch {
      // ignore storage failures (private mode, quota, etc.)
    }
  };

  return (
    <SidebarProvider open={sidebarOpen} onOpenChange={handleSidebarOpenChange}>
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
