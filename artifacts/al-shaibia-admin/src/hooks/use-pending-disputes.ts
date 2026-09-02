import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAutoRefresh } from "./use-auto-refresh";

export function usePendingDisputeCount() {
  const [count, setCount] = useState(0);

  async function fetchCount() {
    try {
      const result = await api.get<{ count: number }>("/disputes/pending-count");
      setCount(result.count ?? 0);
    } catch {
      // Keep the sidebar quiet when an admin session is refreshing or the
      // backend is temporarily unavailable.
    }
  }

  useEffect(() => {
    fetchCount();
  }, []);
  useAutoRefresh(fetchCount, 10000);

  return count;
}
