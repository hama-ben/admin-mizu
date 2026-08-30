import { useEffect, useState } from "react";
import {
  Check,
  Clock3,
  Gift,
  Loader2,
  MapPin,
  Phone,
  RefreshCw,
  UsersRound,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { api } from "@/lib/api";

interface ReferralReward {
  id: string;
  driverId: string;
  thresholdReached: number;
  reachedAt: string;
  rewardGranted: boolean;
  grantedAt: string | null;
  grantedBy: string | null;
  grantedByEmail: string | null;
  driver: {
    id: string;
    name: string | null;
    phone: string | null;
    wilaya: string | null;
    commune: string | null;
  };
}

interface ReferralRewardsResponse {
  pending: ReferralReward[];
  history: ReferralReward[];
}

function dateLabel(value: string | null) {
  return value ? new Date(value).toLocaleString("ar-DZ") : "—";
}

function driverLabel(reward: ReferralReward) {
  return reward.driver.name || reward.driverId;
}

function DriverMeta({ reward }: { reward: ReferralReward }) {
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {reward.driver.phone && (
        <span className="flex items-center gap-1">
          <Phone className="h-3.5 w-3.5" /> {reward.driver.phone}
        </span>
      )}
      {(reward.driver.commune || reward.driver.wilaya) && (
        <span className="flex items-center gap-1">
          <MapPin className="h-3.5 w-3.5" />
          {[reward.driver.commune, reward.driver.wilaya].filter(Boolean).join("، ")}
        </span>
      )}
    </div>
  );
}

export default function ReferralRewardsPage() {
  const [pending, setPending] = useState<ReferralReward[]>([]);
  const [history, setHistory] = useState<ReferralReward[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const { toast } = useToast();

  async function loadRewards(background = false) {
    if (!background) setLoading(true);
    try {
      const result = await api.get<ReferralRewardsResponse>("/referral-rewards");
      setPending(result.pending ?? []);
      setHistory(result.history ?? []);
    } catch (error: any) {
      if (!background) {
        toast({
          title: "تعذر جلب مكافآت الإحالة",
          description: error.message,
          variant: "destructive",
        });
      }
    } finally {
      if (!background) setLoading(false);
    }
  }

  useEffect(() => {
    loadRewards();
  }, []);
  useAutoRefresh(() => loadRewards(true));

  async function grantReward(reward: ReferralReward) {
    const name = driverLabel(reward);
    if (!window.confirm(`هل تريد منح شهر مجاني للسائق ${name}؟`)) return;

    setActionLoading(reward.id);
    try {
      await api.post(`/referral-rewards/${reward.id}/grant`);
      toast({
        title: "تم منح الشهر المجاني",
        description: `حصل ${name} على شهر مجاني وتم إرسال الإشعار.`,
      });
      await loadRewards(true);
    } catch (error: any) {
      toast({
        title: "فشل منح المكافأة",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="animate-in fade-in space-y-8 p-4 duration-500 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Gift className="h-7 w-7 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight">نظام الإحالات</h1>
          </div>
          <p className="mt-2 text-muted-foreground">
            راجع السائقين الذين بلغوا عتبة 10 إحالات وامنحهم شهراً مجانياً.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => loadRewards()}
          disabled={loading}
          className="gap-2"
        >
          <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          تحديث
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="border-amber-500/30 bg-amber-500/[0.04]">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-xl bg-amber-500/15 p-3 text-amber-400">
              <UsersRound className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">بانتظار المراجعة</p>
              <p className="mt-1 text-3xl font-bold">{pending.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-xl bg-primary/15 p-3 text-primary">
              <Check className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">المكافآت الممنوحة</p>
              <p className="mt-1 text-3xl font-bold">{history.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold">السائقون بانتظار المراجعة</h2>
          <Badge>{pending.length}</Badge>
        </div>
        {loading ? (
          <div className="space-y-4">
            {[1, 2].map((item) => (
              <Card key={item}>
                <CardContent className="space-y-3 p-5">
                  <Skeleton className="h-6 w-1/2" />
                  <Skeleton className="h-12 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : pending.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              لا توجد مكافآت بانتظار المراجعة حالياً.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {pending.map((reward) => (
              <Card key={reward.id} className="border-amber-500/30 bg-amber-500/[0.03]">
                <CardContent className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold">{driverLabel(reward)}</h3>
                        <Badge variant="outline" className="border-amber-500/30 text-amber-400">
                          قيد المراجعة
                        </Badge>
                      </div>
                      <DriverMeta reward={reward} />
                    </div>
                    <div className="text-left text-sm text-muted-foreground">
                      <p>العتبة: {reward.thresholdReached} سائقاً</p>
                      <p className="mt-1 flex items-center gap-1">
                        <Clock3 className="h-3.5 w-3.5" /> {dateLabel(reward.reachedAt)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 flex justify-end">
                    <Button
                      onClick={() => grantReward(reward)}
                      disabled={actionLoading === reward.id}
                      className="gap-2"
                    >
                      {actionLoading === reward.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Gift className="h-4 w-4" />
                      )}
                      منح شهر مجاني
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <CardHeader className="px-0">
          <CardTitle className="text-xl">سجل المكافآت الممنوحة</CardTitle>
        </CardHeader>
        {history.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              لا توجد مكافآت ممنوحة بعد.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {history.map((reward) => (
              <Card key={reward.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{driverLabel(reward)}</h3>
                      <Badge variant="outline" className="border-emerald-500/30 text-emerald-400">
                        تم المنح
                      </Badge>
                    </div>
                    <DriverMeta reward={reward} />
                  </div>
                  <div className="text-left text-sm text-muted-foreground">
                    <p>تاريخ المنح: {dateLabel(reward.grantedAt)}</p>
                    <p className="mt-1">الأدمن: {reward.grantedByEmail || reward.grantedBy || "—"}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}