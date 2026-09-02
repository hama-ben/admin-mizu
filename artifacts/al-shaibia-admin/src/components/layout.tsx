import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Users,
  Package,
  Truck,
  CreditCard,
  WalletCards,
  Megaphone,
  AlertTriangle,
  UserX,
  ShieldBan,
  CalendarX,
  MessageSquare,
  ScrollText,
  ClipboardList,
  Gift,
  TicketPercent,
  PackageX,
  Award,
  FileText,
  ChevronRight,
  ChevronLeft,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePendingDisputeCount } from "@/hooks/use-pending-disputes";
import { useDriverCounts } from "@/hooks/use-driver-counts";
import { useSupportUnreadCount } from "@/hooks/use-support-unread";
import { useSuspensionRequestCount } from "@/hooks/use-suspension-request-count";
import { usePendingReferralRewardCount } from "@/hooks/use-pending-referral-rewards";
import { SidebarContext, useSidebar } from "./sidebar-context";
import { Topbar } from "./topbar";

const NAV_ITEMS = [
  { href: "/",                label: "لوحة التحكم",         icon: LayoutDashboard },
  { href: "/users",           label: "المستخدمون",           icon: Users           },
  { href: "/orders",          label: "الطلبات",              icon: Package         },
  { href: "/driver-queue",    label: "طابور السائقين",       icon: Truck           },
  { href: "/payments",        label: "المدفوعات",            icon: CreditCard      },
  { href: "/revenue",         label: "إجمالي الإيرادات",     icon: WalletCards     },
  { href: "/rejected-drivers",label: "السائقون المرفوضون",   icon: UserX           },
  { href: "/suspended-drivers",label:"السائقون الموقوفون",   icon: ShieldBan       },
  { href: "/banned-drivers",  label: "السائقون المحظورون",   icon: ShieldBan       },
  { href: "/expired-accounts",label: "الحسابات المنتهية",    icon: CalendarX       },
  { href: "/appeals",         label: "الطعون",               icon: FileText        },
  { href: "/announcements",   label: "الإعلانات",            icon: Megaphone       },
  { href: "/disputes",        label: "النزاعات",             icon: AlertTriangle   },
  { href: "/support",         label: "خدمة العملاء",         icon: MessageSquare   },
  { href: "/audit-log",       label: "سجل الإجراءات",        icon: ScrollText      },
  { href: "/suspension-requests", label: "طلبات التعليق",       icon: ClipboardList  },
  { href: "/referral-rewards", label: "نظام الإحالات",          icon: Gift           },
  { href: "/incentives", label: "عجلة الحظ والقسائم",           icon: TicketPercent  },
  { href: "/expired-orders", label: "الطلبات المنتهية",          icon: PackageX       },
  { href: "/motivation", label: "نظرة التحفيز",                  icon: Award          },
] as const;

function SidebarContent({ collapsed }: { collapsed: boolean }) {
  const [location] = useLocation();
  const pendingDisputes = usePendingDisputeCount();
  const driverCounts = useDriverCounts();
  const supportUnread = useSupportUnreadCount();
  const suspensionRequests = useSuspensionRequestCount();
  const referralRewards = usePendingReferralRewardCount();
  const { toggleCollapsed, setMobileOpen } = useSidebar();

  const BADGES: Partial<Record<string, number>> = {
    "/driver-queue":     driverCounts.pending   > 0 ? driverCounts.pending   : undefined,
    "/rejected-drivers": driverCounts.rejected  > 0 ? driverCounts.rejected  : undefined,
    "/suspended-drivers":driverCounts.suspended > 0 ? driverCounts.suspended : undefined,
    "/banned-drivers":   driverCounts.banned    > 0 ? driverCounts.banned    : undefined,
    "/expired-accounts": driverCounts.expired   > 0 ? driverCounts.expired   : undefined,
    "/disputes":         pendingDisputes         > 0 ? pendingDisputes         : undefined,
    "/support":          supportUnread           > 0 ? supportUnread           : undefined,
    "/suspension-requests": suspensionRequests > 0 ? suspensionRequests : undefined,
    "/referral-rewards": referralRewards > 0 ? referralRewards : undefined,
  };

  return (
    <div className="flex flex-col h-full">
      {/* Logo + collapse toggle */}
      <div
        className={cn(
          "flex items-center border-b border-sidebar-border shrink-0",
          collapsed ? "justify-center py-4 px-2" : "justify-between px-5 py-4",
        )}
      >
        {!collapsed && (
          <div>
            <p className="text-2xl font-bold text-primary leading-tight tracking-tight">الشعبية</p>
            <p className="text-[10px] text-sidebar-foreground/40 mt-0.5">
              لوحة الإدارة
            </p>
          </div>
        )}
        <button
          onClick={toggleCollapsed}
          title={collapsed ? "توسيع القائمة" : "طي القائمة"}
          className="p-1.5 rounded-md hover:bg-sidebar-accent text-sidebar-foreground/50 hover:text-sidebar-accent-foreground transition-colors shrink-0"
        >
          {collapsed ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
      </div>

      {/* Navigation */}
      <nav
        className={cn("flex-1 py-3 overflow-y-auto space-y-0.5", collapsed ? "px-2" : "px-3")}
      >
        {NAV_ITEMS.map((item) => {
          const isActive = location === item.href;
          const badge = BADGES[item.href];
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              title={collapsed ? item.label : undefined}
              className={cn(
                "relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                collapsed && "justify-center px-2",
                isActive
                  ? "bg-primary/12 text-primary"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            >
              <item.icon className="w-[18px] h-[18px] shrink-0" />
              {!collapsed && (
                <>
                  <span className="flex-1 truncate">{item.label}</span>
                  {badge !== undefined && (
                    <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
                      {badge}
                    </span>
                  )}
                </>
              )}
              {collapsed && badge !== undefined && (
                <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-amber-500 border border-sidebar" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Version footer */}
      {!collapsed && (
        <div className="px-5 py-3 border-t border-sidebar-border">
          <p className="text-[10px] text-sidebar-foreground/25 text-center">
            Al-Shaibia Admin v1.0
          </p>
        </div>
      )}
    </div>
  );
}

function DesktopSidebar() {
  const { collapsed } = useSidebar();
  return (
    <aside
      dir="rtl"
      className={cn(
        "fixed inset-y-0 right-0 bg-sidebar border-l border-sidebar-border z-30",
        "hidden md:flex flex-col transition-[width] duration-300 ease-in-out",
        collapsed ? "w-16" : "w-[260px]",
      )}
    >
      <SidebarContent collapsed={collapsed} />
    </aside>
  );
}

function MobileSidebar() {
  const { mobileOpen, setMobileOpen } = useSidebar();
  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        dir="rtl"
        className={cn(
          "fixed inset-y-0 right-0 w-[260px] bg-sidebar border-l border-sidebar-border z-50",
          "md:hidden flex flex-col transition-transform duration-300 ease-in-out",
          mobileOpen ? "translate-x-0" : "translate-x-full",
        )}
      >
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute top-3.5 left-3 p-1.5 rounded-md hover:bg-sidebar-accent text-sidebar-foreground/50 z-10"
        >
          <X className="w-4 h-4" />
        </button>
        <SidebarContent collapsed={false} />
      </aside>
    </>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem("sidebar-collapsed") === "true"; } catch { return false; }
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem("sidebar-collapsed", String(next)); } catch {}
      return next;
    });
  }

  return (
    <SidebarContext.Provider value={{ collapsed, toggleCollapsed, mobileOpen, setMobileOpen }}>
      <div dir="rtl" className="min-h-screen bg-background text-foreground font-sans flex">
        <DesktopSidebar />
        <MobileSidebar />
        <div
          className={cn(
            "flex-1 flex flex-col min-h-0 min-w-0",
            "transition-[margin-left] duration-300 ease-in-out",
            "mr-0 md:mr-[260px]",
            collapsed && "md:mr-16",
          )}
        >
          <Topbar />
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarContext.Provider>
  );
}

export { useSidebar };
