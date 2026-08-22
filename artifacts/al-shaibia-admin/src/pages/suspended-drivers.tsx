import { useEffect, useState } from "react";
import { authedFetch } from "@/lib/api";
import { supabase, USER_TYPE_DRIVER, type User, type DriverDetails } from "@/lib/supabase";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck, ShieldAlert, Clock, MapPin, Phone } from "lucide-react";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";

interface SuspendedDriver extends User {
  details?: DriverDetails | null;
}

export default function SuspendedDriversPage() {
  const [drivers, setDrivers] = useState<SuspendedDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<SuspendedDriver | null>(null);
  const { toast } = useToast();

  async function fetchSuspendedDrivers(isBackground = false) {
    if (!isBackground) setLoading(true);
    try {
      const { data: suspended, error } = await supabase
        .from("users")
        .select("id, name, phone, email, wilaya, commune, account_status, user_type, subscription_expires_at, created_at")
        .eq("user_type", USER_TYPE_DRIVER)
        .eq("account_status", "suspended")
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (!suspended || suspended.length === 0) { setDrivers([]); return; }

      const userIds = suspended.map((d) => d.id);
      const { data: details } = await supabase.from("driver_details").select("*").in("driver_id", userIds);
      const detailsMap = new Map<string, DriverDetails>((details ?? []).map((d) => [d.driver_id, d]));

      setDrivers(suspended.map((d) => ({ ...d, details: detailsMap.get(d.id) ?? null })));
    } catch (err: any) {
      if (!isBackground) {
         toast({ title: "تعذر جلب السائقين الموقوفين", description: err.message, variant: "destructive" });
      }
    } finally {
      if (!isBackground) setLoading(false);
    }
  }

  useEffect(() => { fetchSuspendedDrivers(false); }, []);
  useAutoRefresh(() => fetchSuspendedDrivers(true));

  async function handleUnsuspend(driver: SuspendedDriver) {
    setActionLoading(driver.id);
    setConfirmTarget(null);
    try {
      const res = await authedFetch(`/users/${driver.id}/unsuspend`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body.error ?? res.statusText);
      }
      toast({ title: "تم إلغاء الإيقاف", description: `${driver.name} يمكنه الآن استخدام حسابه.` });
      setDrivers((prev) => prev.filter((d) => d.id !== driver.id));
    } catch (err: any) {
      toast({ title: "فشل الإجراء", description: err.message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  }

  return (
     <div className="p-4 sm:p-6 lg:p-8 space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">السائقون الموقوفون</h1>
        <p className="text-muted-foreground mt-2">
           حسابات السائقين الموقوفة مؤقتاً — {loading ? "…" : drivers.length} حساب.
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {Array(6).fill(0).map((_, i) => (
            <Card key={i}><CardContent className="p-6 space-y-4"><Skeleton className="h-6 w-3/4" /><Skeleton className="h-4 w-1/2" /></CardContent></Card>
          ))}
        </div>
      ) : drivers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground bg-card border rounded-lg border-dashed">
          <ShieldAlert className="w-12 h-12 mb-4 opacity-30" />
           <h3 className="text-xl font-medium text-foreground">لا يوجد سائقون موقوفون</h3>
           <p>ستظهر حسابات السائقين الموقوفة مؤقتاً هنا.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {drivers.map((driver) => (
            <Card key={driver.id} className="flex flex-col border-border bg-card">
              <CardHeader className="pb-3 border-b border-border/50">
                <CardTitle className="flex justify-between items-start gap-2 text-lg">
                  <span className="font-semibold truncate">{driver.name || "—"}</span>
                  <Badge variant="outline" className="text-xs bg-orange-500/10 text-orange-400 border-orange-500/20 shrink-0">
                    موقوف مؤقتاً
                  </Badge>
                </CardTitle>
                <div className="space-y-1 text-xs text-muted-foreground">
                  {driver.phone && <div className="flex items-center gap-1"><Phone className="w-3 h-3" /> {driver.phone}</div>}
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
              <CardContent className="p-4 flex-1" />
              <CardFooter className="p-4 bg-muted/10 border-t border-border">
                <Button
                  className="w-full bg-green-600 hover:bg-green-700 text-white gap-1.5"
                  onClick={() => setConfirmTarget(driver)}
                  disabled={actionLoading === driver.id}
                >
                  <ShieldCheck className="w-4 h-4" /> إلغاء الإيقاف
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!confirmTarget} onOpenChange={(open) => !open && setConfirmTarget(null)}>
        <DialogContent dir="rtl">
          <DialogHeader className="text-right">
            <DialogTitle>إلغاء إيقاف الحساب</DialogTitle>
            <DialogDescription>
              هل تريد إعادة تفعيل حساب <strong>{confirmTarget?.name}</strong>؟ سيتمكن من استخدام التطبيق مجدداً.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmTarget(null)}>إلغاء</Button>
            <Button onClick={() => confirmTarget && handleUnsuspend(confirmTarget)} disabled={!!actionLoading}>
               <ShieldCheck className="w-4 h-4 ml-1" /> تأكيد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
