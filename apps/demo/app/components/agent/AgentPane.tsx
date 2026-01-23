"use client";

import { useAtomValue } from "jotai";
import { useAction } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { activeAgentTabAtom } from "@/src/atoms";
import { TabNav } from "./TabNav";
import { InstanceTreeTab } from "./InstanceTreeTab";
import { StateTab } from "./StateTab";
import { HistoryTab } from "./HistoryTab";
import { CommandsTab } from "./CommandsTab";
import { DevTab } from "./DevTab";

interface SerializedInstance {
  id: string;
  node: { ref?: string; instructions?: string } | string;
  state: unknown;
  children?: SerializedInstance[];
  packStates?: Record<string, unknown>;
  suspended?: { reason: string };
}

interface SerializedCommandInfo {
  name: string;
  description: string;
  inputSchema: { type: string; properties?: Record<string, unknown> };
}

interface AgentPaneProps {
  sessionId: Id<"sessions">;
  instance: SerializedInstance | undefined;
  onResetSession: () => void;
}

export function AgentPane({ sessionId, instance, onResetSession }: AgentPaneProps) {
  const activeTab = useAtomValue(activeAgentTabAtom);
  const getCommands = useAction(api.commands.getCommands);
  const [commands, setCommands] = useState<SerializedCommandInfo[]>([]);

  useEffect(() => {
    if (sessionId) {
      getCommands({ sessionId }).then((cmds) => setCommands(cmds as SerializedCommandInfo[])).catch(console.error);
    }
  }, [sessionId, instance, getCommands]);

  return (
    <div className="h-full flex flex-col bg-terminal-bg relative z-0">
      {/* Header */}
      <div className="px-4 py-2 border-b border-terminal-green-dimmer">
        <h2 className="text-terminal-green terminal-glow text-sm font-bold">
          AGENT INSPECTOR
        </h2>
      </div>

      {/* Tab navigation */}
      <TabNav />

      {/* Tab content */}
      <div className="flex-1 overflow-hidden p-4">
        {activeTab === "tree" && (
          <InstanceTreeTab instance={instance ?? null} />
        )}
        {activeTab === "state" && <StateTab instance={instance ?? null} />}
        {activeTab === "history" && <HistoryTab sessionId={sessionId} />}
        {activeTab === "commands" && (
          <CommandsTab sessionId={sessionId} commands={commands} />
        )}
        {activeTab === "dev" && <DevTab onResetSession={onResetSession} />}
      </div>
    </div>
  );
}
