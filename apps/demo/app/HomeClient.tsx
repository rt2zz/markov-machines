"use client";

import { useEffect } from "react";
import { useAtom, useAtomValue } from "jotai";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { inputAtom, isLoadingAtom, scanlinesEnabledAtom } from "@/src/atoms";
import { useSessionId } from "@/src/hooks";
import { TerminalPane } from "./components/terminal/TerminalPane";
import { AgentPane } from "./components/agent/AgentPane";

export function HomeClient({
  initialSessionId,
}: {
  initialSessionId: Id<"sessions"> | null;
}) {
  const [sessionId, setSessionId] = useSessionId(initialSessionId);
  const [input, setInput] = useAtom(inputAtom);
  const [isLoading, setIsLoading] = useAtom(isLoadingAtom);
  const scanlinesEnabled = useAtomValue(scanlinesEnabledAtom);

  const createSession = useAction(api.chat.createSession);
  const sendMessage = useAction(api.chat.send);
  const messages = useQuery(
    api.messages.list,
    sessionId ? { sessionId } : "skip"
  );
  const session = useQuery(api.sessions.get, sessionId ? { id: sessionId } : "skip");

  // Create session on mount if none exists or if stale
  useEffect(() => {
    // Wait for session query to resolve
    if (sessionId && session === undefined) return; // Still loading

    // If we have a sessionId but session is null, it's stale - clear it
    if (sessionId && session === null) {
      setSessionId(null);
      return;
    }

    // If no sessionId, create a new session
    if (!sessionId) {
      createSession().then(setSessionId);
    }
  }, [sessionId, session, createSession, setSessionId]);

  const handleSend = async () => {
    if (!sessionId || !input.trim() || isLoading) return;

    const message = input.trim();
    setInput("");
    setIsLoading(true);

    try {
      await sendMessage({ sessionId, message });
    } catch (error) {
      console.error("Failed to send message:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!sessionId) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="terminal-glow">Initializing session...</div>
      </div>
    );
  }

  return (
    <div className="h-screen flex">
      {/* Left side - Terminal pane */}
      <div className="w-1/2 h-full border-r border-terminal-green-dimmer relative">
        {scanlinesEnabled && <div className="terminal-scanlines absolute inset-0" />}
        <TerminalPane
          messages={messages ?? []}
          input={input}
          onInputChange={setInput}
          onSend={handleSend}
          isLoading={isLoading}
        />
      </div>

      {/* Right side - Agent pane */}
      <div className="w-1/2 h-full relative">
        {scanlinesEnabled && <div className="terminal-scanlines absolute inset-0" />}
        <AgentPane sessionId={sessionId} instance={session?.instance} />
      </div>
    </div>
  );
}
