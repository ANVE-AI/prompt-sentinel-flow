import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Topbar } from "@/components/topbar";
import { CommandPalette } from "@/components/command-palette";
import { MobileSidebar } from "@/components/mobile-sidebar";
import { DashboardSidebar } from "@/components/dashboard-sidebar";

const SIDEBAR_STORAGE_KEY = "dashboard:sidebar:open";
/** Default expanded state used both on first visit and after a reset. */
const SIDEBAR_DEFAULT_OPEN = true;
/** Custom event fired by UI affordances ("Reset sidebar layout") to clear
 *  the persisted sidebar state and restore the default expanded behavior. */
export const SIDEBAR_RESET_EVENT = "dashboard:sidebar:reset";

const DashboardLayout = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return SIDEBAR_DEFAULT_OPEN;
    try {
      const stored = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
      if (stored === null) return SIDEBAR_DEFAULT_OPEN;
      return stored !== "false";
    } catch {
      return SIDEBAR_DEFAULT_OPEN;
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

  // Listen for "Reset sidebar layout" requests from anywhere in the dashboard.
  useEffect(() => {
    const onReset = () => {
      try {
        window.localStorage.removeItem(SIDEBAR_STORAGE_KEY);
      } catch {
        // ignore
      }
      setSidebarOpen(SIDEBAR_DEFAULT_OPEN);
    };
    window.addEventListener(SIDEBAR_RESET_EVENT, onReset);
    return () => window.removeEventListener(SIDEBAR_RESET_EVENT, onReset);
  }, []);

  // Cross-tab sync: when another tab toggles or resets the sidebar, mirror
  // that change here immediately. The `storage` event only fires in *other*
  // tabs (not the one that wrote the value), which is exactly what we want.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== null && e.key !== SIDEBAR_STORAGE_KEY) return;
      // key === null means storage was cleared entirely; treat as reset.
      if (e.key === null || e.newValue === null) {
        setSidebarOpen(SIDEBAR_DEFAULT_OPEN);
        return;
      }
      setSidebarOpen(e.newValue !== "false");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

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
