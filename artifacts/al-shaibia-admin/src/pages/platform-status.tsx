import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Power, Save, Truck, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { supabase, type PlatformRole, type PlatformStatus } from "@/lib/supabase";

const ROLE_CONFIG: Record<PlatformRole, {
  title: string;
  description: string;
  icon: typeof Users;
  accent: string;
}> = {
  consumer: {
    title: "واجهة المستهلك",
    description: "التحكم في قدرة المستهلكين على استخدام وظائف التطبيق.",
    icon: Users,
    accent: "text-sky-400",
  },
  driver: {
    title: "واجهة السائق",
    description: "التحكم في قدرة السائقين على استخدام وظائف التطبيق.",
    icon: Truck,
    accent: "text-amber-400",
  },
};

function StatusCard({
  status,
  onChange,
  onSave,
  saving,
}: {
  status: PlatformStatus;
  onChange: (next: PlatformStatus) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const config = ROLE_CONFIG[status.role];
  const Icon = config.icon;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border/60 bg-muted/20">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className={`rounded-lg bg-background p-2.5 ${config.accent}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-lg">{config.title}</CardTitle>
              <CardDescription className="mt-1 leading-relaxed">{config.description}</CardDescription>
            </div>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
            status.enabled
              ? "bg-emerald-500/15 text-emerald-400"
              : "bg-red-500/15 text-red-400"
          }`}>
            {status.enabled ? "مفعّلة ✅" : "مغلقة ⛔"}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 p-6">
        <div className="flex items-center justify-between rounded-lg border border-border bg-background/40 p-4">
          <div className="flex items-center gap-3">
            {status.enabled
              ? <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              : <AlertTriangle className="h-5 w-5 text-red-400" />}
            <div>
              <p className="font-medium">{status.enabled ? "الواجهة متاحة للمستخدمين" : "الواجهة مغلقة مؤقتاً"}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {status.enabled ? "يمكن للمستخدمين استعمال الوظائف بشكل طبيعي." : "ستظهر الرسالة أدناه عند محاولة استعمال وظيفة."}
              </p>
            </div>
          </div>
          <Switch
            checked={status.enabled}
            onCheckedChange={(enabled) => onChange({ ...status, enabled })}
            aria-label={`تفعيل ${config.title}`}
          />
        </div>

        <div className="space-y-2">
          <label htmlFor={`${status.role}-message`} className="text-sm font-medium">
            رسالة الإغلاق
          </label>
          <Textarea
            id={`${status.role}-message`}
            value={status.message ?? ""}
            onChange={(event) => onChange({ ...status, message: event.target.value })}
            placeholder="اكتب الرسالة التي ستظهر لمستخدمي هذه الواجهة عند الإغلاق..."
            className="min-h-[150px] resize-y"
            dir="rtl"
          />
          <p className="text-xs text-muted-foreground">
            هذه الرسالة خاصة بهذه الواجهة فقط، ويمكن أن تكون بأي محتوى أو طول.
          </p>
        </div>

        {!status.enabled && status.disabled_since && (
          <p className="text-xs text-muted-foreground">
            بدأ الإغلاق: {new Date(status.disabled_since).toLocaleString("ar-DZ")}
          </p>
        )}

        <Button type="button" onClick={onSave} disabled={saving} className="w-full sm:w-auto">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? "جارٍ الحفظ..." : "حفظ"}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function PlatformStatusPage() {
  const [statuses, setStatuses] = useState<Record<PlatformRole, PlatformStatus> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<PlatformRole | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;
    async function loadStatuses() {
      setLoading(true);
      const { data, error } = await supabase
        .from("platform_status")
        .select("role, enabled, message, disabled_since")
        .in("role", ["consumer", "driver"]);
      if (cancelled) return;
      if (error) {
        toast({ title: "تعذر جلب حالة الواجهات", description: error.message, variant: "destructive" });
      } else {
        const byRole = Object.fromEntries((data ?? []).map((row) => [row.role, row])) as Partial<Record<PlatformRole, PlatformStatus>>;
        if (byRole.consumer && byRole.driver) {
          setStatuses({ consumer: byRole.consumer, driver: byRole.driver });
        } else {
          toast({ title: "بيانات حالة الواجهات غير مكتملة", description: "تحقق من تشغيل هجرة platform_status في Supabase.", variant: "destructive" });
        }
      }
      setLoading(false);
    }
    loadStatuses();
    return () => { cancelled = true; };
  }, [toast]);

  function updateStatus(role: PlatformRole, next: PlatformStatus) {
    setStatuses((current) => current ? { ...current, [role]: next } : current);
  }

  async function saveStatus(role: PlatformRole) {
    const status = statuses?.[role];
    if (!status) return;
    setSaving(role);
    const { error } = await supabase
      .from("platform_status")
      .update({ enabled: status.enabled, message: status.message })
      .eq("role", role);
    setSaving(null);
    if (error) {
      toast({ title: "فشل حفظ الحالة", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "تم الحفظ", description: `تم تحديث ${ROLE_CONFIG[role].title} بشكل مستقل.` });
  }

  return (
    <div className="animate-in fade-in space-y-8 p-4 duration-500 sm:p-6 lg:p-8">
      <div>
        <div className="flex items-center gap-3">
          <Power className="h-7 w-7 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight">حالة التطبيق</h1>
        </div>
        <p className="mt-2 text-muted-foreground">
          تحكم بشكل مستقل في تفعيل واجهتي المستهلك والسائق ورسالة الإغلاق الظاهرة لكل منهما.
        </p>
      </div>

      {loading ? (
        <div className="grid gap-6 lg:grid-cols-2">
          {[1, 2].map((item) => <Card key={item}><CardContent className="space-y-4 p-6"><Skeleton className="h-8 w-1/2" /><Skeleton className="h-24 w-full" /><Skeleton className="h-10 w-24" /></CardContent></Card>)}
        </div>
      ) : statuses ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <StatusCard status={statuses.consumer} onChange={(next) => updateStatus("consumer", next)} onSave={() => saveStatus("consumer")} saving={saving === "consumer"} />
          <StatusCard status={statuses.driver} onChange={(next) => updateStatus("driver", next)} onSave={() => saveStatus("driver")} saving={saving === "driver"} />
        </div>
      ) : null}
    </div>
  );
}