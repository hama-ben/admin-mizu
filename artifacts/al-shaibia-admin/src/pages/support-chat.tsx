import { useEffect, useState, useMemo, useRef } from "react";
import { useSearch } from "wouter";
import { supabase } from "@/lib/supabase";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { formatDate } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  MessageSquare,
  Search,
  Send,
  CheckCircle,
  RotateCcw,
  Lock,
  ChevronDown,
  ChevronUp,
  Plus,
  StickyNote,
  Zap,
} from "lucide-react";

// ── Quick-reply templates ───────────────────────────────────────────────────
const QUICK_REPLIES: { label: string; text: string }[] = [
  { label: "ترحيب",       text: "مرحباً! كيف يمكنني مساعدتك اليوم؟" },
  { label: "استلام",      text: "تم استلام رسالتك وسنرد في أقرب وقت ممكن، شكراً لصبرك." },
  { label: "اعتذار",      text: "نعتذر عن الإزعاج، سنبذل قصارى جهدنا لحل المشكلة في أقرب وقت." },
  { label: "تأكيد حل",   text: "تم حل مشكلتك بنجاح. هل تحتاج إلى أي مساعدة أخرى؟" },
  { label: "متابعة",      text: "سنتابع موضوعك مع الفريق المختص وسنعود إليك قريباً." },
  { label: "سائق قادم",  text: "السائق في طريقه إليك وسيصل خلال 30 دقيقة تقريباً." },
  { label: "تأكيد طلب",  text: "تم تأكيد طلبك بنجاح وسيتم معالجته قريباً." },
  { label: "طلب معلومات", text: "هل يمكنك تزويدنا بمزيد من التفاصيل حول مشكلتك حتى نتمكن من مساعدتك بشكل أفضل؟" },
  { label: "خارج الدوام", text: "شكراً على تواصلك. مواعيد الدعم هي من 8 صباحاً حتى 8 مساءً. سنرد عليك أول شيء غداً." },
];

interface SupportMessage {
  id: string;
  user_id: string | null;
  message: string;
  status: string | null;
  created_at: string;
  sender_type: "user" | "admin" | null;
  admin_id?: string | null;
}

interface ConvUser {
  id: string;
  name: string;
  phone?: string | null;
  user_type: string;
}

interface Conversation {
  userId: string | null;
  user: ConvUser | null;
  messages: SupportMessage[];
  lastMessage: SupportMessage | null;
  isUnread: boolean;
  isResolved: boolean;
}

interface ConversationNote {
  id: string;
  conversation_user_id: string;
  note: string;
  created_at: string;
}

type FilterType = "all" | "unread" | "resolved" | "سائق" | "مستهلك";

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return "الآن";
  if (diffMins < 60) return `${diffMins}د`;
  if (diffHours < 24) return `${diffHours}س`;
  if (diffDays < 7) return `${diffDays}ي`;
  return date.toLocaleDateString("ar-DZ", { day: "numeric", month: "short" });
}

export default function SupportChatPage() {
  // ── Messages state ──────────────────────────────────────
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [users, setUsers] = useState<Map<string, ConvUser>>(new Map());
  const [loading, setLoading] = useState(true);
  const queryString = useSearch();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(() => new URLSearchParams(queryString).get("userId"));
  useEffect(() => {
    const uid = new URLSearchParams(queryString).get("userId");
    if (uid) setSelectedUserId(uid);
  }, [queryString]);
  // If we've navigated straight to a user with no existing support
  // messages, their info won't be in `users` yet (that map is only
  // populated from message rows) — fetch it directly so the synthetic
  // conversation below has a name/phone/type to show.
  useEffect(() => {
    if (selectedUserId && !users.has(selectedUserId)) {
      fetchUser(selectedUserId);
    }
  }, [selectedUserId, users]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const channelName = useRef(`support-chat-${Math.random().toString(36).slice(2)}`);
  /** True while sendReply is in-flight; silentRefresh skips during this window
   *  to avoid overwriting the optimistic message before the real row arrives. */
  const sendingRef = useRef(false);
  const { toast } = useToast();

  // ── Notes state ─────────────────────────────────────────
  const [notes, setNotes] = useState<ConversationNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [notesOpen, setNotesOpen] = useState(true);

  // ── Real-time subscription ───────────────────────────────
  useEffect(() => {
    fetchAll();
    const channel = supabase
      .channel(channelName.current)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "support_messages" },
        (payload) => {
          const newMsg = payload.new as SupportMessage;
          setMessages((prev) => {
            // Deduplicate: skip if already present (optimistic update or prior event)
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
          if (newMsg.user_id) {
            setUsers((prev) => {
              if (!prev.has(newMsg.user_id!)) fetchUser(newMsg.user_id!);
              return prev;
            });
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "support_messages" },
        (payload) => {
          const updated = payload.new as SupportMessage;
          setMessages((prev) =>
            prev.map((m) => (m.id === updated.id ? { ...m, status: updated.status } : m)),
          );
        },
      )
      .subscribe((status) => {
        console.log("[Realtime] support_messages channel status:", status);
      });
    return () => { supabase.removeChannel(channel); };
  }, []);

  // ── Silent polling fallback (3 s) ────────────────────────
  // Ensures new messages appear even if Supabase Realtime is not enabled
  // for the support_messages table in the Supabase dashboard.
  async function silentRefresh() {
    // Guard at entry AND after the async fetch: a send may have started while
    // the Supabase request was in-flight, in which case we discard the result
    // to avoid overwriting the optimistic message.
    if (sendingRef.current) return;
    const { data: msgs } = await supabase
      .from("support_messages")
      .select("*")
      .order("created_at", { ascending: true });
    if (!msgs || sendingRef.current) return;
    setMessages(msgs as SupportMessage[]);

    const ids = [...new Set(msgs.map((m) => m.user_id).filter(Boolean))] as string[];
    if (ids.length > 0) {
      const { data: usersData } = await supabase
        .from("users")
        .select("id, name, phone, user_type")
        .in("id", ids);
      if (usersData) setUsers(new Map((usersData as ConvUser[]).map((u) => [u.id, u])));
    }
  }
  useAutoRefresh(silentRefresh, 15000);

  // Auto-scroll on new message or conversation switch
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, selectedUserId]);

  // Fetch notes when conversation changes
  useEffect(() => {
    if (selectedUserId) {
      fetchNotes(selectedUserId);
    } else {
      setNotes([]);
    }
    setNoteText("");
  }, [selectedUserId]);

  // ── Data fetching ────────────────────────────────────────
  async function fetchAll() {
    setLoading(true);
    try {
      const { data: msgs, error } = await supabase
        .from("support_messages")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;

      setMessages(msgs ?? []);

      const ids = [...new Set((msgs ?? []).map((m) => m.user_id).filter(Boolean))] as string[];
      if (ids.length > 0) {
        const { data: usersData } = await supabase
          .from("users")
          .select("id, name, phone, user_type")
          .in("id", ids);
        setUsers(new Map((usersData ?? []).map((u: ConvUser) => [u.id, u])));
      }
    } catch (err: any) {
      toast({ title: "خطأ في جلب الرسائل", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function fetchUser(userId: string) {
    const { data } = await supabase
      .from("users")
      .select("id, name, phone, user_type")
      .eq("id", userId)
      .single();
    if (data) setUsers((prev) => new Map(prev).set(data.id, data));
  }

  async function fetchNotes(userId: string) {
    setNotesLoading(true);
    try {
      const { data, error } = await supabase
        .from("support_conversation_notes")
        .select("*")
        .eq("conversation_user_id", userId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      setNotes(data ?? []);
    } catch {
      // Notes table may not exist yet — fail silently, show empty state
      setNotes([]);
    } finally {
      setNotesLoading(false);
    }
  }

  // ── Derived state ────────────────────────────────────────
  const conversations = useMemo((): Conversation[] => {
    const groups = new Map<string, SupportMessage[]>();
    for (const msg of messages) {
      const key = msg.user_id ?? "__anon__";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(msg);
    }
    return Array.from(groups.entries())
      .map(([key, msgs]) => {
        const sorted = [...msgs].sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        );
        const last = sorted[sorted.length - 1];
        const userId = key === "__anon__" ? null : key;
        const isResolved = last.status === "resolved";
        return {
          userId,
          user: userId ? (users.get(userId) ?? null) : null,
          messages: sorted,
          lastMessage: last,
          isUnread: !isResolved && (last.sender_type === "user" || last.sender_type == null),
          isResolved,
        };
      })
      .sort(
        (a, b) =>
          new Date(b.lastMessage!.created_at).getTime() -
          new Date(a.lastMessage!.created_at).getTime(),
      );
  }, [messages, users]);

  const filtered = useMemo(() => {
    return conversations.filter((conv) => {
      if (filter === "unread" && !conv.isUnread) return false;
      if (filter === "resolved" && !conv.isResolved) return false;
      if (filter === "سائق" && conv.user?.user_type !== "سائق") return false;
      if (filter === "مستهلك" && conv.user?.user_type !== "مستهلك") return false;
      if (search) {
        const q = search.toLowerCase();
        const matchName = conv.user?.name?.toLowerCase().includes(q);
        const matchPhone = conv.user?.phone?.includes(q);
        if (!matchName && !matchPhone) return false;
      }
      return true;
    });
  }, [conversations, filter, search]);

  // A user reached via "Message via Support" (users.tsx) may have zero
  // prior support_messages rows, so they'll never appear in `conversations`
  // (which is built purely from existing message rows). In that case we
  // synthesize a throwaway, empty conversation just so the chat panel opens
  // for them immediately. It's intentionally NOT added to `conversations`
  // itself, so it never shows up in the sidebar list — once the admin sends
  // the first real message, the row lands in support_messages and the
  // normal grouping above will pick it up on the next refresh like any
  // other conversation, making this placeholder irrelevant from then on.
  const syntheticConv = useMemo((): Conversation | null => {
    if (!selectedUserId) return null;
    if (conversations.some((c) => c.userId === selectedUserId)) return null;
    return {
      userId: selectedUserId,
      user: users.get(selectedUserId) ?? null,
      messages: [],
      lastMessage: null,
      isUnread: false,
      isResolved: false,
    };
  }, [selectedUserId, conversations, users]);

  const selectedConv = useMemo(
    () => conversations.find((c) => c.userId === selectedUserId) ?? syntheticConv,
    [conversations, selectedUserId, syntheticConv],
  );

  const unreadCount = conversations.filter((c) => c.isUnread).length;

  // ── Actions ──────────────────────────────────────────────
  async function sendReply() {
    if (!replyText.trim() || !selectedUserId) return;
    setSending(true);
    sendingRef.current = true;

    // Optimistic update — message appears instantly in the UI
    const tempId = `temp-${Date.now()}`;
    const optimistic: SupportMessage = {
      id: tempId,
      user_id: selectedUserId,
      message: replyText.trim(),
      sender_type: "admin",
      status: "replied",
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setReplyText("");

    try {
      const { data, error } = await supabase
        .from("support_messages")
        .insert({
          user_id: selectedUserId,
          message: optimistic.message,
          sender_type: "admin",
          status: "replied",
        })
        .select()
        .single();
      if (error) throw error;
      const real = data as SupportMessage;
      // Remove the temp entry. If realtime already delivered the real row,
      // deduplicate by dropping any existing entry with the same real ID.
      setMessages((prev) => {
        const withoutTemp = prev.filter((m) => m.id !== tempId);
        if (withoutTemp.some((m) => m.id === real.id)) return withoutTemp;
        return [...withoutTemp, real];
      });
    } catch (err: any) {
      // Roll back optimistic message on failure
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setReplyText(optimistic.message);
      toast({ title: "فشل الإرسال", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
      sendingRef.current = false;
    }
  }

  async function markResolved(userId: string, resolved: boolean) {
    setResolving(true);
    setMessages((prev) =>
      prev.map((m) =>
        m.user_id === userId ? { ...m, status: resolved ? "resolved" : "open" } : m,
      ),
    );
    try {
      const { error } = await supabase
        .from("support_messages")
        .update({ status: resolved ? "resolved" : "open" })
        .eq("user_id", userId);
      if (error) throw error;
      toast({
        title: resolved ? "تم تحديد المحادثة كمحلولة" : "تمت إعادة فتح المحادثة",
        description: resolved
          ? "ستُعاد فتحها تلقائيًا عند وصول رسالة جديدة"
          : "يمكنك الآن الرد على المحادثة",
      });
    } catch (err: any) {
      toast({ title: "فشل التحديث", description: err.message, variant: "destructive" });
      fetchAll();
    } finally {
      setResolving(false);
    }
  }

  async function addNote() {
    if (!noteText.trim() || !selectedUserId) return;
    setAddingNote(true);
    const optimistic: ConversationNote = {
      id: `temp-${Date.now()}`,
      conversation_user_id: selectedUserId,
      note: noteText.trim(),
      created_at: new Date().toISOString(),
    };
    setNotes((prev) => [...prev, optimistic]);
    setNoteText("");
    try {
      const { data, error } = await supabase
        .from("support_conversation_notes")
        .insert({ conversation_user_id: selectedUserId, note: optimistic.note })
        .select()
        .single();
      if (error) throw error;
      // Replace temp entry with the real one
      setNotes((prev) => prev.map((n) => (n.id === optimistic.id ? (data as ConversationNote) : n)));
    } catch (err: any) {
      // Roll back optimistic update
      setNotes((prev) => prev.filter((n) => n.id !== optimistic.id));
      setNoteText(optimistic.note);
      toast({ title: "فشل حفظ الملاحظة", description: err.message, variant: "destructive" });
    } finally {
      setAddingNote(false);
    }
  }

  // ── Constants ────────────────────────────────────────────
  const FILTERS: { value: FilterType; label: string }[] = [
    { value: "all", label: "الكل" },
    { value: "unread", label: "غير مقروء" },
    { value: "resolved", label: "محلول" },
    { value: "سائق", label: "سائق" },
    { value: "مستهلك", label: "مستهلك" },
  ];

  // ── Render ───────────────────────────────────────────────
  return (
    <div dir="rtl" className="flex flex-1 min-h-0 overflow-hidden">

      {/* ════ Left panel: conversation list ════════════════ */}
      <div className="w-[300px] max-sm:w-[42vw] shrink-0 border-l border-border flex flex-col bg-card/50">
        <div className="p-4 border-b border-border space-y-3">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold">خدمة العملاء</h1>
            {unreadCount > 0 && (
              <span className="min-w-[22px] h-5 px-1.5 rounded-full bg-amber-500 text-white text-xs font-bold flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </div>

          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="بحث بالاسم أو الرقم..."
              className="pr-9 h-8 text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex gap-1 flex-wrap">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={cn(
                  "text-[11px] px-2 py-1 rounded-md transition-colors font-medium",
                  filter === f.value
                    ? f.value === "resolved"
                      ? "bg-green-500/20 text-green-400"
                      : "bg-primary/20 text-primary"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <ScrollArea className="flex-1">
          {loading ? (
            <div className="p-3 space-y-2">
              {Array(5).fill(0).map((_, i) => (
                <Skeleton key={i} className="h-[72px] w-full rounded-lg" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              <MessageSquare className="w-8 h-8 mx-auto mb-3 opacity-20" />
              لا توجد محادثات
            </div>
          ) : (
            <div className="p-2 space-y-0.5">
              {filtered.map((conv) => {
                const isSelected = selectedUserId === conv.userId;
                return (
                  <button
                    key={conv.userId ?? "__anon__"}
                    onClick={() => setSelectedUserId(conv.userId)}
                    className={cn(
                      "w-full text-right px-3 py-2.5 rounded-lg transition-colors text-sm",
                      isSelected
                        ? "bg-primary/10 border border-primary/20"
                        : conv.isResolved
                          ? "hover:bg-muted opacity-60"
                          : conv.isUnread
                            ? "hover:bg-muted bg-amber-500/5"
                            : "hover:bg-muted",
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          {conv.isResolved ? (
                            <CheckCircle className="w-3 h-3 text-green-400 shrink-0" />
                          ) : conv.isUnread && !isSelected ? (
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                          ) : null}
                          <span className="font-semibold truncate text-sm">
                            {conv.user?.name ?? "مجهول"}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 mt-0.5">
                          {conv.user?.user_type && (
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[10px] h-4 px-1 py-0 border leading-none",
                                conv.user.user_type === "سائق"
                                  ? "text-blue-400 border-blue-400/30 bg-blue-400/5"
                                  : "text-green-400 border-green-400/30 bg-green-400/5",
                              )}
                            >
                              {conv.user.user_type}
                            </Badge>
                          )}
                          {conv.isResolved && (
                            <Badge
                              variant="outline"
                              className="text-[10px] h-4 px-1 py-0 border leading-none text-emerald-400 border-emerald-400/30 bg-emerald-400/5"
                            >
                              محلول
                            </Badge>
                          )}
                          {conv.user?.phone && (
                            <span className="text-[10px] text-muted-foreground truncate">
                              {conv.user.phone}
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-muted-foreground truncate mt-1 leading-snug">
                          {conv.lastMessage?.sender_type === "admin" && (
                            <span className="text-primary/70">أنت: </span>
                          )}
                          {conv.lastMessage?.message}
                        </p>
                      </div>

                      <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0 mt-0.5">
                        {conv.lastMessage ? formatRelativeTime(conv.lastMessage.created_at) : ""}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* ════ Right panel: conversation view ════════════════ */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedConv ? (
          <>
            {/* Header */}
            <div className="px-6 py-4 border-b border-border flex items-center justify-between shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold text-base">{selectedConv.user?.name ?? "مجهول"}</h2>
                  {selectedConv.isResolved && (
                    <Badge
                      variant="outline"
                      className="text-xs border text-emerald-400 border-emerald-400/30 bg-emerald-400/10 gap-1"
                    >
                      <CheckCircle className="w-3 h-3" />
                      محلول
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  {selectedConv.user?.user_type && (
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-xs border",
                        selectedConv.user.user_type === "سائق"
                          ? "text-blue-400 border-blue-400/30"
                          : "text-green-400 border-green-400/30",
                      )}
                    >
                      {selectedConv.user.user_type}
                    </Badge>
                  )}
                  {selectedConv.user?.phone && (
                    <span className="text-sm text-muted-foreground">
                      {selectedConv.user.phone}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">
                  {selectedConv.messages.length} رسالة
                </span>
                {selectedConv.isResolved ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 h-8 text-xs text-muted-foreground"
                    onClick={() => markResolved(selectedConv.userId!, false)}
                    disabled={resolving || !selectedConv.userId}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    إعادة فتح
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 h-8 text-xs text-emerald-400 border-emerald-400/30 hover:bg-emerald-400/10 hover:text-emerald-300"
                    onClick={() => markResolved(selectedConv.userId!, true)}
                    disabled={resolving || !selectedConv.userId}
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    تحديد كمحلول
                  </Button>
                )}
              </div>
            </div>

            {/* Resolved notice */}
            {selectedConv.isResolved && (
              <div className="mx-6 mt-4 px-4 py-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2.5 shrink-0">
                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                <p className="text-sm text-emerald-400">
                  هذه المحادثة محلولة — ستُعاد فتحها تلقائيًا عند وصول رسالة جديدة.
                </p>
              </div>
            )}

            {/* Messages area */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              {selectedConv.messages.map((msg) => {
                const isAdmin = msg.sender_type === "admin";
                return (
                  <div
                    key={msg.id}
                    className={cn("flex", isAdmin ? "justify-start" : "justify-end")}
                  >
                    <div
                      className={cn(
                        "max-w-[68%] rounded-2xl px-4 py-2.5 text-sm shadow-sm",
                        isAdmin
                          ? "bg-primary text-primary-foreground rounded-br-sm"
                          : "bg-muted text-foreground rounded-bl-sm",
                      )}
                    >
                      <p className="leading-relaxed whitespace-pre-wrap break-words">
                        {msg.message}
                      </p>
                      <p
                        className={cn(
                          "text-[10px] mt-1.5",
                          isAdmin
                            ? "text-primary-foreground/60 text-right"
                            : "text-muted-foreground",
                        )}
                      >
                        {formatDate(msg.created_at)}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* ── Internal notes section ─────────────────────── */}
            <div className="shrink-0 border-t border-amber-500/20 bg-amber-500/[0.04]">
              {/* Notes header — always visible */}
              <button
                className="w-full flex items-center gap-2 px-6 py-3 hover:bg-amber-500/5 transition-colors"
                onClick={() => setNotesOpen((o) => !o)}
              >
                <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="text-xs font-semibold text-amber-400">ملاحظات داخلية</span>
                <span className="text-[10px] text-amber-400/60 border border-amber-400/20 rounded px-1 py-0.5 leading-none mr-1">
                  غير مرئية للمستخدم
                </span>
                {notes.length > 0 && (
                  <span className="text-[10px] text-amber-400/70 mr-1">
                    {notes.length}
                  </span>
                )}
                <div className="mr-auto text-amber-400/60">
                  {notesOpen
                    ? <ChevronUp className="w-3.5 h-3.5" />
                    : <ChevronDown className="w-3.5 h-3.5" />
                  }
                </div>
              </button>

              {/* Notes body — collapsible */}
              {notesOpen && (
                <div className="px-6 pb-3 space-y-3">
                  {/* Existing notes */}
                  {notesLoading ? (
                    <div className="space-y-1.5">
                      <Skeleton className="h-8 w-full rounded-md opacity-50" />
                      <Skeleton className="h-8 w-3/4 rounded-md opacity-50" />
                    </div>
                  ) : !selectedConv.userId ? (
                    <p className="text-xs text-amber-400/60 italic">
                      لا تتوفر ملاحظات للمحادثات المجهولة.
                    </p>
                  ) : notes.length === 0 ? (
                    <div className="flex items-center gap-2 text-amber-400/50">
                      <StickyNote className="w-3.5 h-3.5 shrink-0" />
                      <p className="text-xs italic">لا توجد ملاحظات بعد</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[130px] overflow-y-auto pl-1">
                      {notes.map((n) => (
                        <div
                          key={n.id}
                          className="flex items-start gap-2 group"
                        >
                          <StickyNote className="w-3 h-3 text-amber-400/50 mt-0.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-foreground/80 leading-snug whitespace-pre-wrap break-words">
                              {n.note}
                            </p>
                            <p className="text-[10px] text-amber-400/40 mt-0.5">
                              {formatDate(n.created_at)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <Separator className="bg-amber-500/10" />

                  {/* Add note input */}
                  {selectedConv.userId ? (
                    <div className="flex items-end gap-2">
                      <Textarea
                        placeholder="أضف ملاحظة داخلية..."
                        className="resize-none text-xs min-h-[48px] max-h-[96px] bg-background/60 border-amber-500/20 placeholder:text-amber-400/30 focus-visible:ring-amber-400/30"
                        dir="rtl"
                        value={noteText}
                        onChange={(e) => setNoteText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            addNote();
                          }
                        }}
                      />
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-8 w-8 shrink-0 mb-0.5 border-amber-500/30 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"
                        onClick={addNote}
                        disabled={!noteText.trim() || addingNote}
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            {/* ── Reply input ────────────────────────────────── */}
            <div className="px-6 py-4 border-t border-border shrink-0 space-y-2">
              {selectedConv.isResolved && (
                <p className="text-xs text-muted-foreground">
                  الرد على هذه المحادثة سيعيد فتحها تلقائيًا.
                </p>
              )}

              {/* Quick-reply templates */}
              <div>
                <button
                  onClick={() => setShowTemplates((v) => !v)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-1.5"
                >
                  <Zap className="w-3 h-3 text-primary/70" />
                  <span>ردود سريعة</span>
                  {showTemplates
                    ? <ChevronUp className="w-3 h-3" />
                    : <ChevronDown className="w-3 h-3" />
                  }
                </button>

                {showTemplates && (
                  <div className="flex flex-wrap gap-1.5 max-h-[108px] overflow-y-auto pb-0.5 mb-2">
                    {QUICK_REPLIES.map((t) => (
                      <button
                        key={t.label}
                        onClick={() => {
                          setReplyText(t.text);
                          setShowTemplates(false);
                          setTimeout(() => textareaRef.current?.focus(), 0);
                        }}
                        className="text-[11px] bg-muted hover:bg-primary/10 hover:text-primary border border-border hover:border-primary/30 rounded-md px-2 py-1 transition-colors text-muted-foreground text-right leading-snug"
                        title={t.text}
                      >
                        <span className="font-medium text-foreground/70 mr-1">{t.label}:</span>
                        <span className="line-clamp-1">{t.text}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-end gap-2">
                <Textarea
                  ref={textareaRef}
                  placeholder="اكتب ردك هنا..."
                  className="resize-none text-sm min-h-[60px] max-h-[140px]"
                  dir="rtl"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendReply();
                    }
                  }}
                />
                <Button
                  size="icon"
                  className="h-10 w-10 shrink-0 mb-0.5"
                  onClick={sendReply}
                  disabled={!replyText.trim() || sending}
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Enter للإرسال • Shift+Enter لسطر جديد
              </p>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <MessageSquare className="w-16 h-16 mx-auto mb-4 opacity-15" />
              <p className="text-lg font-semibold text-foreground/50">اختر محادثة</p>
              <p className="text-sm mt-1">
                اختر محادثة من القائمة لعرض الرسائل والرد
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
