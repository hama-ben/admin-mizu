import { useEffect, useState } from "react";
import { Link } from "wouter";
import { supabase, USER_TYPE_DRIVER, type User, type DriverDetails, type SubscriptionPayment } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Clock, MapPin, CalendarX, Bell, CreditCard } from "lucide-react";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";

interface ExpiredDriver extends User {
  details?: DriverDetails | null;
  pendingPayment?: SubscriptionPayment | null;
}

function expirationInfo(isoDate: string): { expired: boolean; days: number } {
  const difference = new Date(isoDate).getTime() - Date.now();
  const day = 1000 * 60 * 60 * 24;
  if (difference <= 0) {
    return { expired: true, days: Math.floor(Math.abs(difference) / day) };
  }
  return { expired: false, days: Math.ceil(difference / day) };
}

export default function ExpiredAccountsPage() {
  const [drivers, setDrivers] = useState<ExpiredDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const [reminderLoading, setReminderLoading] = useState(false);
  const { toast } = useToast();

  async function fetchExpiredDrivers(isBackground = false) {
    if (!isBackground) setLoading(true);
    try {
      const withinNextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: expired, error } = await supabase
        .from("users")
        .select("id, name, phone, email, wilaya, commune, account_status, user_type, subscription_expires_at, first_approval_granted, created_at")
        .eq("user_type", USER_TYPE_DRIVER)
        .eq("account_status", "approved")
        .lte("subscription_expires_at", withinNextWeek)
        .order("subscription_expires_at", { ascending: true });

      if (error) throw error;
      if (!expired || expired.length === 0) { setDrivers([]); return; }

      const userIds = expired.map((d) => d.id);
      const [{ data: details }, { data: payments }] = await Promise.all([
        supabase.from("driver_details").select("*").in("driver_id", userIds),
        supabase
          .from("subscription_payments")
          .select("*")
          .in("driver_id", userIds)
          .eq("status", "pending")
          .order("created_at", { ascending: false }),
      ]);

      const detailsMap = new Map<string, DriverDetails>((details ?? []).map((d) => [d.driver_id, d]));
      const paymentsMap = new Map<string, SubscriptionPayment>();
      (payments ?? []).forEach((p) => {
        if (!paymentsMap.has(p.driver_id)) paymentsMap.set(p.driver_id, p);
      });

      setDrivers(expired.map((d) => ({
        ...d,
        details: detailsMap.get(d.id) ?? null,
        pendingPayment: paymentsMap.get(d.id) ?? null,
      })));
    } catch (err: any) {
      if (!isBackground) {
         toast({ title: "تعذر جلب الحسابات المنتهية", description: err.message, variant: "destructive" });
      }
    } finally {
      if (!isBackground) setLoading(false);
    }
  }

  useEffect(() => { fetchExpiredDrivers(false); }, []);
  useAutoRefresh(() => fetchExpiredDrivers(true));

  async function handleSendReminder() {
    setReminderLoading(true);
    try {
      if (drivers.length === 0) {
        toast({ title: "لا توجد حسابات للتذكير", description: "القائمة الحالية فارغة." });
        return;
      }

      // Send one targeted announcement per account currently shown in this
      // section. Never use the generic "Drivers" audience here.
      const { error } = await supabase.from("announcements").insert(
        drivers.map((driver) => ({
          title: "تذكير بتجديد الاشتراك",
          content: driver.subscription_expires_at && expirationInfo(driver.subscription_expires_at).expired
            ? "انتهت فترة اشتراكك، يرجى تجديد الدفع لمتابعة استقبال الطلبات"
            : "ينتهي اشتراكك خلال أقل من أسبوع، يرجى التجديد لتجنب توقف استقبال الطلبات",
          target_audience: driver.id,
          badge_text: "Warning",
          is_active: true,
        })),
      );
      if (error) throw error;
       toast({ title: "تم إرسال التذكير ✓", description: `تم إرسال التذكير إلى ${drivers.length} حساب داخل القسم.` });
    } catch (err: any) {
       toast({ title: "فشل الإرسال", description: err.message, variant: "destructive" });
    } finally {
      setReminderLoading(false);
    }
  }

  return (
     <div className="p-4 sm:p-6 lg:p-8 space-y-6 animate-in fade-in duration-500">
       <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">الحسابات المنتهية</h1>
          <p className="text-muted-foreground mt-2">
              الحسابات المنتهية أو التي ينتهي اشتراكها خلال أسبوع — {loading ? "…" : drivers.length} حساب.
          </p>
        </div>
        {!loading && drivers.length > 0 && (
          <Button
            variant="outline"
            className="shrink-0 gap-2 border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
            onClick={handleSendReminder}
            disabled={reminderLoading}
          >
            <Bell className="w-4 h-4" />
             إرسال تذكير للحسابات داخل القسم
          </Button>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {Array(6).fill(0).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6 space-y-3">
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-2/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : drivers.length === 0 ? (
         <div className="flex flex-col items-center justify-center py-20 text-muted-foreground bg-card border rounded-lg border-dashed">
          <CalendarX className="w-12 h-12 mb-4 opacity-30" />
           <h3 className="text-xl font-medium text-foreground">لا توجد حسابات منتهية</h3>
            <p>لا توجد حسابات منتهية أو اشتراكات ستنتهي خلال الأسبوع القادم.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {drivers.map((driver) => {
             const expiration = driver.subscription_expires_at
               ? expirationInfo(driver.subscription_expires_at)
               : null;
            const expiredDate = driver.subscription_expires_at
               ? new Date(driver.subscription_expires_at).toLocaleDateString("ar-DZ")
              : "—";

            return (
              <Card key={driver.id} className="flex flex-col border-border bg-card">
                <CardHeader className="pb-3 border-b border-border/50">
                  <CardTitle className="flex justify-between items-start gap-2 text-lg">
                    <span className="font-semibold truncate">{driver.name || "—"}</span>
                    <Badge
                      variant="outline"
                       className={`text-xs shrink-0 ${
                         expiration?.expired
                           ? "bg-orange-500/10 text-orange-400 border-orange-500/20"
                           : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                       }`}
                    >
                       {expiration?.expired ? "منتهي" : "ينتهي قريباً"}
                    </Badge>
                  </CardTitle>
                  <div className="space-y-1.5 text-xs text-muted-foreground">
                    {driver.phone && <div className="flex items-center gap-1">📞 {driver.phone}</div>}
                    {(driver.details?.wilaya || driver.wilaya) && (
                      <div className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {driver.details?.wilaya || driver.wilaya}
                        {(driver.details?.commune || driver.commune) && ` / ${driver.details?.commune || driver.commune}`}
                      </div>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="p-4 flex-1 space-y-3">
                  <div className="flex items-center gap-2 p-3 rounded-md bg-orange-500/5 border border-orange-500/15">
                    <CalendarX className="w-4 h-4 text-orange-400 shrink-0" />
                    <div>
                       <p className={`text-xs font-semibold ${expiration?.expired ? "text-orange-400" : "text-amber-400"}`}>
                         {expiration?.expired
                           ? expiration.days === 0
                             ? "منتهي اليوم"
                             : `منتهي منذ ${expiration.days} ${expiration.days === 1 ? "يوم" : "أيام"}`
                           : expiration?.days === 1
                             ? "ينتهي خلال يوم"
                             : `ينتهي خلال ${expiration?.days ?? "أقل من أسبوع"} أيام`}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                         <Clock className="w-3 h-3" /> {expiration?.expired ? "انتهى في" : "ينتهي في"} {expiredDate}
                      </p>
                    </div>
                  </div>

                  {driver.pendingPayment && (
                    <div className="flex items-center gap-2 p-2 rounded-md bg-amber-500/5 border border-amber-500/15">
                      <CreditCard className="w-4 h-4 text-amber-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-amber-400">إيصال دفع قيد المراجعة</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                           مُرسل في {new Date(driver.pendingPayment.created_at).toLocaleDateString("ar-DZ")}
                        </p>
                      </div>
                      <Link href="/payments" className="text-[10px] text-primary underline underline-offset-2 shrink-0">
                        عرض
                      </Link>
                    </div>
                  )}
                </CardContent>

                <CardFooter className="p-4 pt-0">
                  <p className="text-[10px] text-muted-foreground font-mono break-all">
                    ID: {driver.id.slice(0, 20)}…
                  </p>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
