import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { Bell, ChevronLeft, LogOut, Menu, User } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/lib/supabase";
import { useSidebar } from "./sidebar-context";
import { useTotalNotificationCount } from "@/hooks/use-notification-count";

const BREADCRUMB_MAP: Record<string, { label: string; href?: string }[]> = {
  "/":                 [{ label: "لوحة التحكم" }],
  "/users":            [{ label: "لوحة التحكم", href: "/" }, { label: "المستخدمون" }],
  "/orders":           [{ label: "لوحة التحكم", href: "/" }, { label: "الطلبات" }],
  "/driver-queue":     [{ label: "لوحة التحكم", href: "/" }, { label: "طابور السائقين" }],
  "/payments":         [{ label: "لوحة التحكم", href: "/" }, { label: "المدفوعات" }],
  "/revenue":          [{ label: "لوحة التحكم", href: "/" }, { label: "إجمالي الإيرادات" }],
  "/announcements":    [{ label: "لوحة التحكم", href: "/" }, { label: "الإعلانات" }],
  "/disputes":         [{ label: "لوحة التحكم", href: "/" }, { label: "النزاعات" }],
  "/support":          [{ label: "لوحة التحكم", href: "/" }, { label: "خدمة العملاء" }],
  "/rejected-drivers": [{ label: "لوحة التحكم", href: "/" }, { label: "السائقون المرفوضون" }],
  "/suspended-drivers":[{ label: "لوحة التحكم", href: "/" }, { label: "السائقون الموقوفون" }],
  "/banned-drivers":   [{ label: "لوحة التحكم", href: "/" }, { label: "السائقون المحظورون" }],
  "/expired-accounts": [{ label: "لوحة التحكم", href: "/" }, { label: "الحسابات المنتهية" }],
  "/appeals":          [{ label: "لوحة التحكم", href: "/" }, { label: "الطعون" }],
  "/audit-log":        [{ label: "لوحة التحكم", href: "/" }, { label: "سجل الإجراءات" }],
  "/suspension-requests":[{ label: "لوحة التحكم", href: "/" }, { label: "طلبات التعليق" }],
  "/expired-orders":   [{ label: "لوحة التحكم", href: "/" }, { label: "الطلبات المنتهية" }],
  "/motivation":       [{ label: "لوحة التحكم", href: "/" }, { label: "نظرة التحفيز" }],
  "/debts":            [{ label: "لوحة التحكم", href: "/" }, { label: "دفتر الديون" }],
};

export function Topbar() {
  const [location] = useLocation();
  const { setMobileOpen } = useSidebar();
  const notifCount = useTotalNotificationCount();
  const [adminName, setAdminName] = useState<string | null>(null);

  const crumbs = BREADCRUMB_MAP[location] ?? [{ label: "لوحة التحكم" }];

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user;
      if (user) {
        setAdminName(
          user.user_metadata?.full_name ??
          user.user_metadata?.name ??
          user.email ??
          "مدير النظام",
        );
      }
    });
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  return (
    <header
      dir="rtl"
      className="h-14 border-b border-border bg-card/50 backdrop-blur-sm flex items-center px-4 gap-3 shrink-0 sticky top-0 z-20"
    >
      {/* Mobile hamburger — only visible on small screens */}
      <button
        onClick={() => setMobileOpen(true)}
        className="md:hidden p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        aria-label="فتح القائمة"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Breadcrumb — RTL text in an LTR flex container */}
      <nav className="flex-1 flex items-center gap-1 text-sm" dir="rtl" aria-label="مسار التنقل">
        {crumbs.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronLeft className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />}
            {crumb.href && i < crumbs.length - 1 ? (
              <Link
                href={crumb.href}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {crumb.label}
              </Link>
            ) : (
              <span
                className={
                  i === crumbs.length - 1
                    ? "text-foreground font-medium"
                    : "text-muted-foreground"
                }
              >
                {crumb.label}
              </span>
            )}
          </span>
        ))}
      </nav>

      {/* Notification Bell */}
      <Link
        href="/driver-queue"
        className="relative p-2 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        aria-label={`الإشعارات (${notifCount})`}
      >
        <Bell className="w-[18px] h-[18px]" />
        {notifCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none border border-card">
            {notifCount > 99 ? "99+" : notifCount}
          </span>
        )}
      </Link>

      {/* Admin Profile Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
         <button className="flex items-center gap-2 pr-1 pl-2 py-1.5 rounded-md hover:bg-muted transition-colors outline-none">
            <div className="w-7 h-7 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0">
              <User className="w-3.5 h-3.5 text-primary" />
            </div>
            {adminName && (
              <span className="text-sm font-medium text-foreground max-w-[130px] truncate hidden sm:block">
                {adminName}
              </span>
            )}
          </button>
        </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div dir="rtl">
              {adminName && (
                <>
                  <div className="px-3 py-2">
                    <p className="text-xs text-muted-foreground">تسجيل الدخول كـ</p>
                    <p className="text-sm font-medium truncate mt-0.5">{adminName}</p>
                  </div>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem
                onClick={handleLogout}
                className="gap-2 text-red-400 focus:text-red-400 focus:bg-red-500/10"
              >
                <LogOut className="w-4 h-4" />
                تسجيل الخروج
              </DropdownMenuItem>
            </div>
          </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
