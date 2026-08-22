import { useEffect, useState } from "react";
import { authedFetch } from "@/lib/api";
import { supabase, USER_TYPE_DRIVER, type User, type DriverDetails, type DriverStatus } from "@/lib/supabase";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Check, Trash2, Image as ImageIcon, Clock, MapPin, UserX, ChevronDown, ChevronUp, Save } from "lucide-react";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";

interface DriverAppeal {
  id: string;
  driver_id: string;
  message: string | null;
  status: "pending" | "reviewed";
  admin_response: string | null;
  created_at: string;
  reviewed_at: string | null;
}

interface RejectedDriver extends User {
  details?: DriverDetails | null;
  driverStatus?: DriverStatus | null;
  appeal?: DriverAppeal | null;
}

export default function RejectedDriversPage() {
  const [drivers, setDrivers] = useState<RejectedDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RejectedDriver | null>(null);
  const [expandedAppeals, setExpandedAppeals] = useState<Set<string>>(new Set());
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});
  const { toast } = useToast();

  async function fetchRejectedDrivers(isBackground = false) {
    if (!isBackground) setLoading(true);
    try {
      const { data: rejected, error } = await supabase
        .from("users")
        .select("id, name, phone, email, wilaya, commune, account_status, user_type, subscription_expires_at, first_approval_granted, created_at")
        .eq("user_type", USER_TYPE_DRIVER)
        .eq("account_status", "rejected")
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (!rejected || rejected.length === 0) { setDrivers([]); return; }

      const userIds = rejected.map((d) => d.id);
      const [{ data: details }, { data: statuses }, { data: appeals }] = await Promise.all([
        supabase.from("driver_details").select("*").in("driver_id", userIds),
        supabase.from("driver_status").select("*").in("driver_id", userIds),
        supabase.from("driver_appeals").select("*").in("driver_id", userIds).order("created_at", { ascending: false }),
      ]);

      const detailsMap = new Map<string, DriverDetails>((details ?? []).map((d) => [d.driver_id, d]));
      const statusMap = new Map<string, DriverStatus>((statuses ?? []).map((s) => [s.driver_id, s]));
      const appealsMap = new Map<string, DriverAppeal>();
      (appeals ?? []).forEach((a) => {
        if (!appealsMap.has(a.driver_id)) appealsMap.set(a.driver_id, a);
      });

      setDrivers(rejected.map((d) => ({
        ...d,
        details: detailsMap.get(d.id) ?? null,
        driverStatus: statusMap.get(d.id) ?? null,
        appeal: appealsMap.get(d.id) ?? null,
      })));
    } catch (err: any) {
      if (!isBackground) {
        toast({ title: "تعذر جلب السائقين المرفوضين", description: err.message, variant: "destructive" });
      }
    } finally {
      if (!isBackground) setLoading(false);
    }
  }

  useEffect(() => { fetchRejectedDrivers(false); }, []);
  useAutoRefresh(() => fetchRejectedDrivers(true));

  function toggleAppeal(driverId: string) {
    setExpandedAppeals((prev) => {
      const next = new Set(prev);
      next.has(driverId) ? next.delete(driverId) : next.add(driverId);
      return next;
    });
  }

  async function handleApprove(driver: RejectedDriver) {
    setActionLoading(driver.id);
    try {
      // All subscription date math runs server-side via an atomic SQL UPDATE
      // using GREATEST(COALESCE(subscription_expires_at, NOW()), NOW()) +
      // (daysToAdd * INTERVAL '1 day'). This correctly stacks days on top of
      // any existing future balance — zero frontend reads or writes to
      // subscription_expires_at.
      const res = await authedFetch(`/drivers/${driver.id}/approve`, {
        method: "POST",
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body.error ?? res.statusText);
      }

      const { newExpiry, daysToAdd, firstApprovalGranted } = await res.json();

      if (driver.appeal) {
        const note = (adminNotes[driver.id] ?? "").trim();
        await supabase
          .from("driver_appeals")
          .update({
            status: "reviewed",
            reviewed_at: new Date().toISOString(),
            ...(note ? { admin_response: note } : {}),
          })
          .eq("id", driver.appeal.id);

        await supabase.from("announcements").insert({
          title: "تمت مراجعة طعنك ✅",
          content: "تمت الموافقة على طعنك، تم تفعيل حسابك",
          target_audience: driver.id,
          badge_text: "Success",
          is_active: true,
        });
      } else {
        await supabase.from("announcements").insert({
          title: firstApprovalGranted ? "تم قبول طلبك ✅" : "🎉 تم قبولك بيننا",
          content: firstApprovalGranted
            ? "تم تجديد اشتراكك. مرحباً بعودتك إلى عائلة ميزو!"
            : "تهانينا! حصلت على هدية 30 يوماً + يومين إضافيين كمكافأة على ثقتك بنا. مرحباً بك في عائلة ميزو!",
          target_audience: driver.id,
          badge_text: "Success",
          is_active: true,
        });
      }

      toast({
        title: "تم قبول السائق ✓",
        description: `${driver.name} — ${daysToAdd} يوماً حتى ${new Date(newExpiry).toLocaleDateString("ar-DZ")}.`,
      });
      setDrivers((prev) => prev.filter((d) => d.id !== driver.id));
    } catch (err: any) {
      toast({ title: "فشل الإجراء", description: err.message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  }

  async function handleSaveNote(driver: RejectedDriver) {
    if (!driver.appeal) return;
    const note = (adminNotes[driver.id] ?? "").trim();
    setActionLoading(`note-${driver.id}`);
    try {
      const { error } = await supabase
        .from("driver_appeals")
        .update({
          status: "reviewed",
          reviewed_at: new Date().toISOString(),
          admin_response: note || null,
        })
        .eq("id", driver.appeal.id);
      if (error) throw error;

      toast({ title: "تم حفظ الملاحظة", description: "تم تعليم الطعن كمُراجع، وما زال السائق مرفوضاً." });
      setDrivers((prev) =>
        prev.map((d) =>
          d.id === driver.id
            ? { ...d, appeal: { ...d.appeal!, status: "reviewed", admin_response: note || null, reviewed_at: new Date().toISOString() } }
            : d
        )
      );
    } catch (err: any) {
      toast({ title: "فشل الحفظ", description: err.message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDelete(driver: RejectedDriver) {
    setActionLoading(driver.id);
    setDeleteTarget(null);
    try {
      if (driver.appeal) {
        await supabase.from("driver_appeals").delete().eq("driver_id", driver.id);
      }
      await supabase.from("driver_details").delete().eq("driver_id", driver.id);
      await supabase.from("driver_status").delete().eq("driver_id", driver.id);

      const { error } = await supabase.from("users").delete().eq("id", driver.id);
      if (error) throw error;

      toast({ title: "تم حذف السائق", description: `تم حذف حساب ${driver.name} نهائياً.` });
      setDrivers((prev) => prev.filter((d) => d.id !== driver.id));
    } catch (err: any) {
      toast({ title: "فشل الحذف", description: err.message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  }

  function PhotoBox({ url, label }: { url?: string | null; label: string }) {
    return (
      <div
        className="border rounded-md overflow-hidden aspect-video relative group cursor-pointer bg-muted"
        onClick={() => url && setSelectedImage(url)}
      >
        {url ? (
          <>
            <img src={url} alt={label} className="object-cover w-full h-full" />
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <ImageIcon className="w-6 h-6 text-white" />
            </div>
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground text-center p-2">لا توجد صورة</div>
        )}
        <div className="absolute bottom-0 inset-x-0 bg-background/80 text-[10px] uppercase font-bold text-center py-1">{label}</div>
      </div>
    );
  }

  return (
     <div className="p-4 sm:p-6 lg:p-8 space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">السائقون المرفوضون</h1>
        <p className="text-muted-foreground mt-2">
          طلبات السائقين المرفوضة — {loading ? "…" : drivers.length} طلب.
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {Array(6).fill(0).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6 space-y-4">
                <Skeleton className="h-6 w-3/4" /><Skeleton className="h-4 w-1/2" />
                <div className="grid grid-cols-2 gap-3"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : drivers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground bg-card border rounded-lg border-dashed">
          <UserX className="w-12 h-12 mb-4 opacity-30" />
          <h3 className="text-xl font-medium text-foreground">لا يوجد سائقون مرفوضون</h3>
          <p>ستظهر حسابات السائقين المرفوضة هنا.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {drivers.map((driver) => {
            const appeal = driver.appeal;
            const isExpanded = expandedAppeals.has(driver.id);
            const hasPendingAppeal = appeal && appeal.status === "pending";

            return (
              <Card key={driver.id} className="flex flex-col border-border bg-card">
                <CardHeader className="pb-3 border-b border-border/50">
                  <CardTitle className="flex justify-between items-start gap-2 text-lg">
                    <span className="font-semibold truncate">{driver.name || "—"}</span>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <Badge variant="outline" className="text-xs bg-red-500/10 text-red-400 border-red-500/20">
                        مرفوض
                      </Badge>
                      {appeal && (
                        <button
                          onClick={() => toggleAppeal(driver.id)}
                          className="flex items-center gap-1 text-xs font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-2 py-0.5 hover:bg-amber-500/20 transition-colors"
                        >
                          📩 طعن مُقدّم
                          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                      )}
                    </div>
                  </CardTitle>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    {driver.phone && <div className="flex items-center gap-1">📞 {driver.phone}</div>}
                    {(driver.details?.wilaya || driver.wilaya) && (
                      <div className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {driver.details?.wilaya || driver.wilaya}
                        {(driver.details?.commune || driver.commune) && ` / ${driver.details?.commune || driver.commune}`}
                      </div>
                    )}
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      مسجل منذ: {driver.created_at ? new Date(driver.created_at).toLocaleDateString("ar-DZ") : "—"}
                    </div>
                  </div>
                </CardHeader>

                {/* Appeal panel */}
                {appeal && isExpanded && (
                  <div className="border-b border-amber-500/20 bg-amber-500/5 px-4 py-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-amber-400 uppercase tracking-wide">رسالة الطعن</p>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${appeal.status === "pending" ? "bg-amber-500/20 text-amber-400 border-amber-500/20" : "bg-green-500/20 text-green-400 border-green-500/20"}`}>
                          {appeal.status === "pending" ? "قيد المراجعة" : "تمت المراجعة"}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(appeal.created_at).toLocaleDateString("ar-DZ")}
                        </span>
                      </div>
                    </div>
                    <p className="text-sm text-foreground/90 leading-relaxed bg-background/50 rounded-md p-2 border border-border/50">
                      {appeal.message || "—"}
                    </p>

                    {appeal.admin_response && (
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">ملاحظة الإدارة</p>
                        <p className="text-sm text-foreground/80 bg-background/50 rounded-md p-2 border border-border/50">
                          {appeal.admin_response}
                        </p>
                      </div>
                    )}

                    {hasPendingAppeal && (
                      <div>
                        <Textarea
                          placeholder="ملاحظة الإدارة..."
                          value={adminNotes[driver.id] ?? ""}
                          onChange={(e) => setAdminNotes((prev) => ({ ...prev, [driver.id]: e.target.value }))}
                          className="text-sm resize-none h-20 bg-background/70"
                          dir="rtl"
                        />
                      </div>
                    )}
                  </div>
                )}

                <CardContent className="p-4 flex-1">
                  <div className="grid grid-cols-2 gap-3">
                    <PhotoBox url={driver.details?.truck_front_photo_url} label="واجهة الشاحنة" />
                    <PhotoBox url={driver.details?.driver_license_url} label="رخصة السياقة" />
                    {driver.details?.truck_side_photo_url && (
                      <PhotoBox url={driver.details.truck_side_photo_url} label="جانب الشاحنة" />
                    )}
                    {driver.details?.truck_video_url && (
                      <div className="border rounded-md overflow-hidden aspect-video relative bg-muted flex items-center justify-center">
                        <a href={driver.details.truck_video_url} target="_blank" rel="noopener noreferrer" className="text-primary text-xs underline">
                          عرض الفيديو
                        </a>
                        <div className="absolute bottom-0 inset-x-0 bg-background/80 text-[10px] font-bold text-center py-1">فيديو الشاحنة</div>
                      </div>
                    )}
                  </div>
                </CardContent>

                <CardFooter className="flex flex-col gap-2 p-4 bg-muted/10 border-t border-border">
                  <div className="grid grid-cols-2 gap-3 w-full">
                    <Button
                      variant="outline"
                      className="w-full text-red-500 hover:text-red-600 hover:bg-red-500/10 border-red-500/20 gap-1.5"
                      onClick={() => setDeleteTarget(driver)}
                      disabled={!!actionLoading}
                    >
                      <Trash2 className="w-4 h-4" /> حذف نهائي
                    </Button>
                    <Button
                      className="w-full bg-green-600 hover:bg-green-700 text-white gap-1.5"
                      onClick={() => handleApprove(driver)}
                      disabled={!!actionLoading}
                    >
                      <Check className="w-4 h-4" /> قبول الآن
                    </Button>
                  </div>

                  {hasPendingAppeal && (
                    <Button
                      variant="outline"
                      className="w-full gap-1.5 text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
                      onClick={() => { if (!isExpanded) toggleAppeal(driver.id); handleSaveNote(driver); }}
                      disabled={actionLoading === `note-${driver.id}`}
                    >
                      <Save className="w-4 h-4" /> حفظ الملاحظة فقط
                    </Button>
                  )}
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}

      {/* Document image lightbox */}
      <Dialog open={!!selectedImage} onOpenChange={(open) => !open && setSelectedImage(null)}>
        <DialogContent className="max-w-4xl bg-transparent border-none shadow-none p-0">
          {selectedImage && (
            <img src={selectedImage} alt="Document Preview" className="w-full h-auto max-h-[85vh] object-contain rounded-md" />
          )}
        </DialogContent>
      </Dialog>

      {/* Permanent delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-500">حذف نهائي — تأكيد</DialogTitle>
            <DialogDescription>
              هل أنت متأكد من حذف حساب <strong>{deleteTarget?.name}</strong> بشكل نهائي؟
              سيتم حذف جميع بياناته بما فيها وثائق التسجيل{deleteTarget?.appeal ? " وسجل الطعن" : ""}. هذا الإجراء لا يمكن التراجع عنه.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>إلغاء</Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
              disabled={!!actionLoading}
            >
              <Trash2 className="w-4 h-4 ml-1" /> حذف نهائي
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
