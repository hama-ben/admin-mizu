import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

export function useSupportUnreadCount(): number {
  const [count, setCount] = useState(0);
  const channelName = useRef(`support-unread-${Math.random().toString(36).slice(2)}`);

  async function fetchCount() {
    const { data } = await supabase
      .from("support_messages")
      .select("*")
      .order("created_at", { ascending: false });

    if (!data) return;

    const seen = new Set<string>();
    let unread = 0;
    for (const msg of data) {
      const key = msg.user_id ?? "__anon__";
      if (!seen.has(key)) {
        seen.add(key);
        if (msg.sender_type === "user" || msg.sender_type == null) unread++;
      }
    }
    setCount(unread);
  }

  useEffect(() => {
    fetchCount();
    const channel = supabase
      .channel(channelName.current)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_messages" }, fetchCount)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  return count;
}
