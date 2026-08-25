import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  supabase, USER_TYPE_DRIVER, USER_TYPE_CONSUMER,
  type User, type DriverDetails, type DriverSuspensionRequest,
} from "@/lib/supabase";
import { authedFetch } from "@/lib/api";
import { ALGERIAN_WILAYAS, formatDZD, formatDate } from "@/lib/constants";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger, ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ChevronLeft, ChevronRight, Search, User as UserIcon, MessageSquare, ShieldBan,
  ShieldAlert, ShieldCheck, Package, Star, Wallet, Clock, MapPin, Phone, Mail,
  Image as ImageIcon,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { StatusLegend } from "@/components/status-legend";

const PAGE_SIZE = 20;

function getStatusBadge(status?: string | null) {
  switch (status) {
    case "approved":  return <Badge variant="outline" className="bg-green-500/20 text-green-500 border-green-500/30">موافق عليه</Badge>;
    case "pending":   return <Badge variant="outline" className="bg-amber-500/20 text-amber-500 border-amber-500/30">معلّق</Badge>;
    case "rejected":  return <Badge variant="outline" className="bg-red-500/20 text-red-500 border-red-500/30">مرفوض</Badge>;
    case "suspended": return <Badge variant="outline" className="bg-orange-500/20 text-orange-500 border-orange-500/30">موقوف</Badge>;
    case "banned":    return <Badge variant="outline" className="bg-zinc-700/40 text-zinc-300 border-zinc-500/30">محظور</Badge>;
    default:          return <Badge variant="outline">{status || "—"}</Badge>;
  }
}

interface DriverStats {
  totalOrders: number;
  completedOrders: number;
  totalEarnings: number;
  avgRating: number | null;
  ratingCount: number;
}

interface ConsumerStats {
  totalOrders: number;
  completedOrders: number;
  totalSpent: number;
}

export default function UsersPage() {
  const [, setLocation] = useLocation();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeTab, setTypeTab] = useState<"all" | typeof USER_TYPE_DRIVER | typeof USER_TYPE_CONSUMER>("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [wilayaFilter, setWilayaFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const { toast } = useToast();

  const [profileUser, setProfileUser] = useState<User | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [driverStats, setDriverStats] = useState<DriverStats | null>(null);
  const [driverDetails, setDriverDetails] = useState<DriverDetails | null>(null);
  const [driverRequests, setDriverRequests] = useState<DriverSuspensionRequest[]>([]);
  const [consumerStats, setConsumerStats] = useState<ConsumerStats | null>(null);

  const [confirmAction, setConfirmAction] = useState<{ user: User; action: "suspend" | "ban" | "unsuspend" | "unban" } | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const filtersRef = useRef({ typeTab, statusFilter, search, wilayaFilter, page });
  filtersRef.current = { typeTab, statusFilter, search, wilayaFilter, page };

  useEffect(() => { setPage(0); }, [typeTab, statusFilter, search, wilayaFilter]);
  useEffect(() => {
    const timer = setTimeout(() => fetchUsers(false), search ? 400 : 0);
    return () => clearTimeout(timer);
  }, [typeTab, statusFilter, search, wilayaFilter, page]);

  useAutoRefresh(() => fetchUsers(true));

  async function fetchUsers(isBackground = false) {
    const { typeTab, statusFilter, search, wilayaFilter, page } = filtersRef.current;
    if (!isBackground) setLoading(true);
    try {
      let query = supabase
        .from("users")
        .select("id, name, phone, email, user_type, wilaya, commune, account_status, subscription_expires_at, created_at", { count: "exact" });

      if (typeTab !== "all") query = query.eq("user_type", typeTab);
      if (statusFilter !== "all") query = query.eq("account_status", statusFilter);
      if (wilayaFilter !== "all") query = query.eq("wilaya", wilayaFilter);
      if (search) {
        query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);
      }

      const { data, count, error } = await query
        .order("name")
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (error) throw error;
      setUsers((data as User[]) ?? []);
      setTotalCount(count ?? 0);
    } catch (err: any) {
      if (!isBackground) {
        toast({ title: "تعذر جلب المستخدمين", description: err.message, variant: "destructive" });
      }
    } finally {
      if (!isBackground) setLoading(false);
    }
  }

  async function openProfile(user: User) {
    setProfileUser(user);
    setProfileLoading(true);
    setDriverStats(null);
    setDriverDetails(null);
    setDriverRequests([]);
    setConsumerStats(null);
    try {
      if (user.user_type === USER_TYPE_DRIVER) {
        const [{ count: totalOrders }, { count: completedOrders }, { data: revenueRows }, { data: ratingRows }, { data: details, error: detailsError }, { data: suspensionRequests, error: requestsError }] = await Promise.all([
          supabase.from("orders").select("*", { count: "exact", head: true }).eq("driver_id", user.id),
          supabase.from("orders").select("*", { count: "exact", head: true }).eq("driver_id", user.id).eq("status", "تم التوصيل"),
          supabase.from("orders").select("total_price").eq("driver_id", user.id).eq("status", "تم التوصيل"),
          supabase.from("ratings").select("stars").eq("rated_user_id", user.id),
          supabase.from("driver_details").select("*").eq("driver_id", user.id).maybeSingle(),
          supabase.from("driver_suspension_requests").select("*").eq("driver_id", user.id).order("created_at", { ascending: false }),
        ]);
        if (detailsError) throw detailsError;
        if (requestsError) throw requestsError;
        setDriverDetails(details as DriverDetails | null);
        setDriverRequests((suspensionRequests ?? []) as DriverSuspensionRequest[]);
        const totalEarnings = (revenueRows ?? []).reduce((s, o: any) => s + Number(o.total_price), 0);
        const stars = (ratingRows ?? []).map((r: any) => Number(r.stars)).filter((n) => !Number.isNaN(n));
        const avgRating = stars.length ? stars.reduce((a, b) => a + b, 0) / stars.length : null;
        setDriverStats({
          totalOrders: totalOrders ?? 0,
          completedOrders: completedOrders ?? 0,
          totalEarnings,
          avgRating,
          ratingCount: stars.length,
        });
      } else {
        const [{ count: totalOrders }, { count: completedOrders }, { data: spentRows }] = await Promise.all([
          supabase.from("orders").select("*", { count: "exact", head: true }).eq("user_id", user.id),
          supabase.from("orders").select("*", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "تم التوصيل"),
          supabase.from("orders").select("total_price").eq("user_id", user.id).eq("status", "تم التوصيل"),
        ]);
        const totalSpent = (spentRows ?? []).reduce((s, o: any) => s + Number(o.total_price), 0);
        setConsumerStats({
          totalOrders: totalOrders ?? 0,
          completedOrders: completedOrders ?? 0,
          totalSpent,
        });
      }
    } catch (err: any) {
      toast({ title: "خطأ في جلب بيانات الملف الشخصي", description: err.message, variant: "destructive" });
    } finally {
      setProfileLoading(false);
    }
  }

  function messageViaSupport(user: User) {
    setLocation(`/support?userId=${user.id}`);
  }

  async function runAction(user: User, action: "suspend" | "ban" | "unsuspend" | "unban") {
    setActionLoading(user.id);
    setConfirmAction(null);
    try {
      const res = await authedFetch(`/users/${user.id}/${action}`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body.error ?? res.statusText);
      }
      const { accountStatus } = await res.json();
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, account_status: accountStatus } : u)));
      const labels: Record<string, string> = {
        suspend: "تم إيقاف الحساب مؤقتاً",
        unsuspend: "تم إلغاء إيقاف الحساب",
        ban: "تم حظر الحساب",
        unban: "تم إلغاء حظر الحساب",
      };
      toast({ title: labels[action] ?? "تم التحديث", description: user.name });
    } catch (err: any) {
      toast({ title: "فشل الإجراء", description: err.message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  }

  const CONFIRM_COPY: Record<string, { title: string; body: (name: string) => string; confirmLabel: string }> = {
    suspend: { title: "إيقاف الحساب مؤقتاً", body: (n) => `هل أنت متأكد من إيقاف حساب ${n} مؤقتاً؟ سيتمكن المستخدم من العودة لاحقاً.`, confirmLabel: "إيقاف" },
    ban: { title: "حظر الحساب نهائياً", body: (n) => `هل أنت متأكد من حظر حساب ${n}؟ هذا إجراء خطير يمنع المستخدم من استخدام التطبيق.`, confirmLabel: "حظر" },
    unsuspend: { title: "إلغاء إيقاف الحساب", body: (n) => `إعادة تفعيل حساب ${n}؟`, confirmLabel: "إلغاء الإيقاف" },
    unban: { title: "إلغاء حظر الحساب", body: (n) => `إعادة تفعيل حساب ${n} بعد الحظر؟`, confirmLabel: "إلغاء الحظر" },
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 animate-in fade-in duration-500 flex flex-col h-full">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">المستخدمون</h1>
        <p className="text-muted-foreground mt-2">جميع المستخدمين المسجلين — سائقون ومستهلكون. انقر بزر الفأرة الأيمن على الصف لعرض الإجراءات.</p>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          {(["all", USER_TYPE_DRIVER, USER_TYPE_CONSUMER] as const).map((t) => (
            <Button
              key={t}
              size="sm"
              variant={typeTab === t ? "default" : "outline"}
              onClick={() => setTypeTab(t)}
            >
              {t === "all" ? `الكل (${totalCount})` : t === USER_TYPE_DRIVER ? "السائقون" : "المستهلكون"}
            </Button>
          ))}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-[140px] text-sm"><SelectValue placeholder="الحالة" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">جميع الحالات</SelectItem>
              <SelectItem value="pending">معلّق</SelectItem>
              <SelectItem value="approved">موافق عليه</SelectItem>
              <SelectItem value="rejected">مرفوض</SelectItem>
              <SelectItem value="suspended">موقوف</SelectItem>
              <SelectItem value="banned">محظور</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-3">
          <div className="relative w-56">
            <Search className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="ابحث بالاسم أو الهاتف…" value={search} onChange={(e) => setSearch(e.target.value)} className="pr-9" />
          </div>
          <Select value={wilayaFilter} onValueChange={setWilayaFilter}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="جميع الولايات" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">جميع الولايات</SelectItem>
              {ALGERIAN_WILAYAS.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <StatusLegend variant="users" />
      <div className="border rounded-md overflow-hidden bg-card flex-1">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>الاسم</TableHead>
              <TableHead>الهاتف</TableHead>
              <TableHead>النوع</TableHead>
              <TableHead>الولاية</TableHead>
              <TableHead>البلدية</TableHead>
              <TableHead>الحالة</TableHead>
              <TableHead>الاشتراك</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array(10).fill(0).map((_, i) => (
                <TableRow key={i}>{Array(7).fill(0).map((__, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
              ))
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">لم يتم العثور على مستخدمين.</TableCell>
              </TableRow>
            ) : (
              users.map((user) => (
                <ContextMenu key={user.id}>
                  <ContextMenuTrigger asChild>
                    <TableRow className={actionLoading === user.id ? "opacity-50" : ""}>
                      <TableCell className="font-medium">{user.name || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{user.phone || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={user.user_type === USER_TYPE_DRIVER ? "bg-blue-500/10 text-blue-400 border-blue-500/20" : "bg-purple-500/10 text-purple-400 border-purple-500/20"}>
                          {user.user_type}
                        </Badge>
                      </TableCell>
                      <TableCell>{user.wilaya || "—"}</TableCell>
                      <TableCell>{user.commune || "—"}</TableCell>
                      <TableCell>{getStatusBadge(user.account_status)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {user.subscription_expires_at
                          ? new Date(user.subscription_expires_at).toLocaleDateString("en-GB")
                          : "—"}
                      </TableCell>
                    </TableRow>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="w-56">
                    <ContextMenuItem onClick={() => openProfile(user)} className="gap-2">
                      <UserIcon className="w-4 h-4" /> عرض الملف الشخصي
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => messageViaSupport(user)} className="gap-2">
                      <MessageSquare className="w-4 h-4" /> مراسلة عبر الدعم
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    {user.account_status === "suspended" ? (
                      <ContextMenuItem onClick={() => setConfirmAction({ user, action: "unsuspend" })} className="gap-2 text-green-500">
                        <ShieldCheck className="w-4 h-4" /> إلغاء الإيقاف
                      </ContextMenuItem>
                    ) : user.account_status !== "banned" ? (
                      <ContextMenuItem onClick={() => setConfirmAction({ user, action: "suspend" })} className="gap-2 text-orange-500">
                        <ShieldAlert className="w-4 h-4" /> إيقاف مؤقت
                      </ContextMenuItem>
                    ) : null}
                    {user.account_status === "banned" ? (
                      <ContextMenuItem onClick={() => setConfirmAction({ user, action: "unban" })} className="gap-2 text-green-500">
                        <ShieldCheck className="w-4 h-4" /> إلغاء الحظر
                      </ContextMenuItem>
                    ) : (
                      <ContextMenuItem onClick={() => setConfirmAction({ user, action: "ban" })} className="gap-2 text-red-500">
                        <ShieldBan className="w-4 h-4" /> حظر نهائي
                      </ContextMenuItem>
                    )}
                  </ContextMenuContent>
                </ContextMenu>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          عرض {users.length > 0 ? page * PAGE_SIZE + 1 : 0}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} من أصل {totalCount}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0 || loading}>
            <ChevronRight className="w-4 h-4 ml-1" /> السابق
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={(page + 1) * PAGE_SIZE >= totalCount || loading}>
            التالي <ChevronLeft className="w-4 h-4 mr-1" />
          </Button>
        </div>
      </div>

      {/* ── Profile dialog ─────────────────────────────────────────── */}
      <Dialog open={!!profileUser} onOpenChange={(open) => !open && setProfileUser(null)}>
        <DialogContent className="max-w-lg" dir="rtl">
          {profileUser && (
            <>
              <DialogHeader className="text-right">
                <DialogTitle className="flex items-center gap-2">
                  <UserIcon className="w-5 h-5" /> {profileUser.name || "—"}
                </DialogTitle>
                <DialogDescription>
                  {profileUser.user_type === USER_TYPE_DRIVER ? "ملف سائق" : "ملف مستهلك"}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground"><Phone className="w-4 h-4" /> {profileUser.phone || "—"}</div>
                  <div className="flex items-center gap-2 text-muted-foreground"><Mail className="w-4 h-4" /> {profileUser.email || "—"}</div>
                  <div className="flex items-center gap-2 text-muted-foreground"><MapPin className="w-4 h-4" /> {profileUser.wilaya || "—"} {profileUser.commune ? `/ ${profileUser.commune}` : ""}</div>
                  <div className="flex items-center gap-2 text-muted-foreground"><Clock className="w-4 h-4" /> {profileUser.created_at ? formatDate(profileUser.created_at) : "—"}</div>
                </div>

                <div className="flex items-center gap-2">
                  {getStatusBadge(profileUser.account_status)}
                  {profileUser.user_type === USER_TYPE_DRIVER && profileUser.subscription_expires_at && (
                    <span className="text-xs text-muted-foreground">
                      الاشتراك حتى {formatDate(profileUser.subscription_expires_at)}
                    </span>
                  )}
                </div>

                {profileUser.user_type === USER_TYPE_DRIVER && (
                  <div className="border-t pt-4">
                    <h4 className="text-sm font-semibold mb-3 text-muted-foreground">وثائق السائق</h4>
                    {profileLoading ? (
                      <div className="grid grid-cols-2 gap-3">
                        <Skeleton className="h-32 w-full" />
                        <Skeleton className="h-32 w-full" />
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-3">
                        <DriverDocument
                          url={driverDetails?.truck_front_photo_url}
                          label="صورة الشاحنة"
                        />
                        <DriverDocument
                          url={driverDetails?.driver_license_url}
                          label="رخصة القيادة"
                        />
                      </div>
                    )}
                  </div>
                )}

                {profileUser.user_type === USER_TYPE_DRIVER && driverRequests.length > 0 && (
                  <div className="border-t pt-4">
                    <h4 className="text-sm font-semibold mb-3 text-muted-foreground">طلبات تعليق الحساب</h4>
                    <div className="space-y-2">
                      {driverRequests.map((request) => (
                        <div key={request.id} className="rounded-md border border-orange-500/20 bg-orange-500/5 p-3 text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">
                              {request.request_type === "suspend" ? "طلب تعليق الحساب" : "طلب إلغاء التعليق"}
                            </span>
                            <Badge variant="outline" className={request.status === "approved"
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                              : request.status === "rejected"
                                ? "border-red-500/30 bg-red-500/10 text-red-400"
                                : "border-amber-500/30 bg-amber-500/10 text-amber-400"}>
                              {request.status === "approved" ? "تمت الموافقة" : request.status === "rejected" ? "مرفوض" : "قيد المراجعة"}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            السبب: {request.reason === "other" && request.reason_text
                              ? request.reason_text
                              : request.reason === "truck_issue"
                                ? "مشكلة في الشاحنة"
                                : request.reason === "medical"
                                  ? "سبب مرضي"
                                  : request.reason === "personal_leave"
                                    ? "عطلة شخصية"
                                    : "سبب آخر"}
                          </p>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {formatDate(request.created_at)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="border-t pt-4">
                  <h4 className="text-sm font-semibold mb-3 text-muted-foreground">إحصائيات مباشرة</h4>
                  {profileLoading ? (
                    <div className="grid grid-cols-2 gap-3">
                      {Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
                    </div>
                  ) : profileUser.user_type === USER_TYPE_DRIVER && driverStats ? (
                    <div className="grid grid-cols-2 gap-3">
                      <StatBox icon={Package} label="إجمالي الطلبات" value={String(driverStats.totalOrders)} />
                      <StatBox icon={Package} label="طلبات مكتملة" value={String(driverStats.completedOrders)} />
                      <StatBox icon={Wallet} label="إجمالي الأرباح" value={formatDZD(driverStats.totalEarnings)} />
                      <StatBox icon={Star} label="متوسط التقييم" value={driverStats.avgRating != null ? `${driverStats.avgRating.toFixed(1)} (${driverStats.ratingCount})` : "لا يوجد"} />
                    </div>
                  ) : consumerStats ? (
                    <div className="grid grid-cols-2 gap-3">
                      <StatBox icon={Package} label="إجمالي الطلبات" value={String(consumerStats.totalOrders)} />
                      <StatBox icon={Package} label="طلبات مكتملة" value={String(consumerStats.completedOrders)} />
                      <StatBox icon={Wallet} label="إجمالي الإنفاق" value={formatDZD(consumerStats.totalSpent)} />
                    </div>
                  ) : null}
                </div>

                <Button variant="outline" className="w-full gap-2" onClick={() => { messageViaSupport(profileUser); setProfileUser(null); }}>
                  <MessageSquare className="w-4 h-4" /> مراسلة عبر الدعم
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Suspend / Ban confirmation ─────────────────────────────── */}
      <AlertDialog open={!!confirmAction} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent dir="rtl">
          {confirmAction && (
            <>
              <AlertDialogHeader className="text-right">
                <AlertDialogTitle>{CONFIRM_COPY[confirmAction.action].title}</AlertDialogTitle>
                <AlertDialogDescription>
                  {CONFIRM_COPY[confirmAction.action].body(confirmAction.user.name || "هذا المستخدم")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="gap-2">
                <AlertDialogCancel>إلغاء</AlertDialogCancel>
                <AlertDialogAction
                  className={confirmAction.action === "ban" || confirmAction.action === "suspend" ? "bg-red-600 hover:bg-red-700" : ""}
                  onClick={() => runAction(confirmAction.user, confirmAction.action)}
                >
                  {CONFIRM_COPY[confirmAction.action].confirmLabel}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatBox({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="bg-muted/40 rounded-lg p-3 flex items-center gap-3">
      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <div>
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold">{value}</p>
      </div>
    </div>
  );
}

function DriverDocument({ url, label }: { url?: string | null; label: string }) {
  return (
    <div className="space-y-1.5">
      <div className="h-32 overflow-hidden rounded-md border bg-muted">
        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer" className="block h-full">
            <img src={url} alt={label} className="h-full w-full object-cover transition-opacity hover:opacity-80" />
          </a>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
            <ImageIcon className="h-5 w-5 opacity-50" />
            لا توجد صورة
          </div>
        )}
      </div>
      <p className="text-center text-xs font-medium text-muted-foreground">{label}</p>
    </div>
  );
}
