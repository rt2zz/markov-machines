import { useState, useCallback } from "react";
import Cookies from "js-cookie";
import type { Id } from "../convex/_generated/dataModel";

const SESSION_COOKIE_KEY = "sessionId";

export function useSessionId(initialSessionId: Id<"sessions"> | null) {
  const [sessionId, setSessionIdState] = useState<Id<"sessions"> | null>(initialSessionId);

  const setSessionId = useCallback((id: Id<"sessions"> | null) => {
    if (id) {
      Cookies.set(SESSION_COOKIE_KEY, id, { expires: 365 });
    } else {
      Cookies.remove(SESSION_COOKIE_KEY);
    }
    setSessionIdState(id);
  }, []);

  return [sessionId, setSessionId] as const;
}
