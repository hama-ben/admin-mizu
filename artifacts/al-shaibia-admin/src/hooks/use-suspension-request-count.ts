import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export function useSuspensionRequestCount() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const result = await api.get<{ count: number }>("/suspension-requests/pending-count");
        if (active) setCount(result.count);
      } catch {
        // The page still works if the optional badge request is unavailable.
      }
    };
    load();
    const timer = window.setInterval(load, 30_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  return count;
}