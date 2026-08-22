import { useEffect, useState } from "react";
import { authedFetch } from "@/lib/api";
import { Link } from "wouter";
import { supabase, USER_TYPE_DRIVER, type User, type DriverDetails, type DriverStatus } from "@/lib/supabase";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Check, X, Image as ImageIcon, Clock, MapPin, UserX } from "lucide-react";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { useDriverCounts } from "@/hooks/use-driver-counts";

interface PendingDriver extends User {
  details?: DriverDetails | null;
  driverStatus?: DriverStatus | null;
}

export default function DriverQueuePage() {
  const [drivers, setDrivers] = useState<PendingDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const driverCounts = useDriverCounts();
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const { toast } = useToast();

  async function fetchPendingDrivers(isBackground = false) {
    if (!isBackground) setLoading(true);
    try {
      const { data: pending, error } = await supabase
        .from("users")
        .select("id, name, phone, email, wilaya, commune, account_status, user_type, subscription_expires_at, first_approval_granted, created_at")
        .eq("user_type", USER_TYPE_DRIVER)
        .eq("account_status", "pending")
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (!pending || pending.length === 0) { setDrivers([]); return; }

      const userIds = pending.map((d) => d.id);
      const [{ data: details }, { data: statuses }] = await Promise.all([
        supabase.from("driver_details").select("*").in("driver_id", userIds),
        supabase.from("driver_status").select("*").in("driver_id", userIds),
      ]);

      const detailsMap = new Map<string, DriverDetails>((details ?? []).map((d) => [d.driver_id, d]));
      const statusMap = new Map<string, DriverStatus>((statuses ?? []).map((s) => [s.driver_id, s]));

      setDrivers(pending.map((d) => ({
        ...d,
        details: detailsMap.get(d.id) ?? null,
        driverStatus: statusMap.get(d.id) ?? null,
      })));
    } catch (err: any) {
      if (!isBackground) {
         toast({ title: "تعذر جلب طابور السائقين", description: err.message, variant: "destructive" });
      }
    } finally {
      if (!isBackground) setLoading(false);
    }
  }

  useEffect(() => {
    fetchPendingDrivers(false);
    const channel = supabase
      .channel("driver-queue-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "users" }, () => fetchPendingDrivers(true))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  useAutoRefresh(() => fetchPendingDrivers(true));

  async function handleApprove(driverId: string, driverName: string, firstApprovalGranted: boolean | null | undefined) {
    setActionLoading(driverId);
    try {
      // All subscription date math runs server-side via an atomic SQL UPDATE
      // using GREATEST(COALESCE(subscription_expires_at, NOW()), NOW()) +
      // (daysToAdd * INTERVAL '1 day'). Zero frontend reads or writes to
      // subscription_expires_at.
      const res = await authedFetch(`/drivers/${driverId}/approve`, {
        method: "POST",
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body.error ?? res.statusText);
      }

      const { newExpiry, daysToAdd } = await res.json();

      await supabase.from("announcements").insert({
        title: firstApprovalGranted ? "تم قبول طلبك ✅" : "🎉 تم قبولك بيننا",
        content: firstApprovalGranted
          ? "تم تجديد اشتراكك. مرحباً بعودتك إلى عائلة ميزو!"
          : "تهانينا! حصلت على هدية 30 يوماً + يومين إضافيين كمكافأة على ثقتك بنا. مرحباً بك في عائلة ميزو!",
        target_audience: driverId,
        badge_text: "Success",
        is_active: true,
      });

      toast({
        title: "تم قبول السائق ✓",
        description: `${driverName} — تم تمديد الاشتراك ${daysToAdd} يوماً حتى ${new Date(newExpiry).toLocaleDateString("ar-DZ")}.`,
      });
      setDrivers((prev) => prev.filter((d) => d.id !== driverId));
    } catch (err: any) {
      console.error("[Approve] caught error:", err);
      toast({ title: "فشل الإجراء", description: err.message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReject(driverId: string, driverName: string) {
    setActionLoading(driverId);
    try {
      // Rejection runs server-side via an atomic transaction with SELECT FOR
      // UPDATE + WHERE account_status = 'pending' guard. Returns 409 if the
      // driver was already processed by a concurrent action.
      const res = await authedFetch(`/drivers/${driverId}/reject`, {
        method: "POST",
      });

      if (res.status === 409) {
        toast({
          title: "تمت معالجة الطلب مسبقاً",
          description: "تم قبول هذا السائق أو رفضه مسبقاً.",
        });
        setDrivers((prev) => prev.filter((d) => d.id !== driverId));
        return;
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body.error ?? res.statusText);
      }

      await supabase.from("announcements").insert({
        title: "تم رفض طلبك",
        content: "عذراً، لم يتم قبول طلبك. يرجى التواصل معنا عبر الفيسبوك: https://www.facebook.com/profile.php?id=61590856328769",
        target_audience: driverId,
        badge_text: "Warning",
        is_active: true,
      });

      toast({ title: "تم رفض السائق", description: `تم رفض طلب ${driverName}.` });
      setDrivers((prev) => prev.filter((d) => d.id !== driverId));
    } catch (err: any) {
      toast({ title: "فشل الإجراء", description: err.message, variant: "destructive" });
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
          <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground text-center p-2">
            لا توجد صورة
          </div>
        )}
        <div className="absolute bottom-0 inset-x-0 bg-background/80 text-[10px] uppercase font-bold text-center py-1">
          {label}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6 animate-in fade-in duration-500">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">طابور السائقين</h1>
          <p className="text-muted-foreground mt-2">
            طلبات السائقين المعلّقة — {loading ? "…" : drivers.length} بانتظار المراجعة.
          </p>
        </div>
        <Link
          href="/rejected-drivers"
          className="shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-md border border-red-500/20 bg-red-500/5 text-red-400 hover:bg-red-500/10 transition-colors text-sm font-medium"
        >
          <UserX className="w-4 h-4" />
          عرض السائقون المرفوضون
          {driverCounts.rejected > 0 && (
            <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center">
              {driverCounts.rejected}
            </span>
          )}
        </Link>
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
          <Check className="w-12 h-12 mb-4 text-green-500/50" />
           <h3 className="text-xl font-medium text-foreground">الطابور فارغ</h3>
           <p>تمت مراجعة جميع طلبات السائقين المعلّقة.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {drivers.map((driver) => (
            <Card key={driver.id} className="flex flex-col border-border bg-card">
              <CardHeader className="pb-3 border-b border-border/50">
                <CardTitle className="flex justify-between items-center text-lg">
                  <span className="font-semibold truncate">{driver.name || "—"}</span>
                  {driver.driverStatus?.current_status && (
                    <Badge variant="outline" className="text-xs shrink-0 mr-2">{driver.driverStatus.current_status}</Badge>
                  )}
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
                     المعرّف: <span className="font-mono">{driver.id.slice(0, 16)}…</span>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-4 flex-1">
                <div className="grid grid-cols-2 gap-3">
                   <PhotoBox url={driver.details?.truck_front_photo_url} label="واجهة الشاحنة" />
                   <PhotoBox url={driver.details?.driver_license_url} label="رخصة السياقة" />
                   {driver.details?.truck_side_photo_url && <PhotoBox url={driver.details.truck_side_photo_url} label="جانب الشاحنة" />}
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

              <CardFooter className="grid grid-cols-2 gap-3 p-4 bg-muted/10 border-t border-border">
                <Button
                  variant="outline"
                  className="w-full text-red-500 hover:text-red-600 hover:bg-red-500/10 border-red-500/20 gap-1.5"
                  onClick={() => handleReject(driver.id, driver.name)}
                  disabled={actionLoading === driver.id}
                >
                  <X className="w-4 h-4" /> رفض
                </Button>
                <Button
                  className="w-full bg-green-600 hover:bg-green-700 text-white gap-1.5"
                  onClick={() => handleApprove(driver.id, driver.name, driver.first_approval_granted)}
                  disabled={actionLoading === driver.id}
                >
                  <Check className="w-4 h-4" /> قبول
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!selectedImage} onOpenChange={(open) => !open && setSelectedImage(null)}>
        <DialogContent className="max-w-4xl bg-transparent border-none shadow-none p-0">
          {selectedImage && (
            <img src={selectedImage} alt="Document Preview" className="w-full h-auto max-h-[85vh] object-contain rounded-md" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
