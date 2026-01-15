import { useState, useCallback, useEffect } from "react";
import Cookies from "js-cookie";
import type { Id } from "../convex/_generated/dataModel";

const SESSION_COOKIE_KEY = "sessionId";
const DEV_MODE_KEY = "devMode";

function getStoredSessionId(): Id<"sessions"> | null {
  const stored = Cookies.get(SESSION_COOKIE_KEY);
  return stored ? (stored as Id<"sessions">) : null;
}

export function useSessionId(initialSessionId: Id<"sessions"> | null) {
  // Read from cookie if no initial value provided
  const [sessionId, setSessionIdState] = useState<Id<"sessions"> | null>(
    () => initialSessionId ?? getStoredSessionId()
  );

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

export function useDevMode(): [boolean, (value: boolean) => void] {
  const [devMode, setDevModeState] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(DEV_MODE_KEY);
    if (stored) setDevModeState(stored === "true");
  }, []);

  const setDevMode = useCallback((value: boolean) => {
    localStorage.setItem(DEV_MODE_KEY, String(value));
    setDevModeState(value);
  }, []);

  return [devMode, setDevMode];
}
