"use client";

import { useAtom, useSetAtom } from "jotai";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id, Doc } from "@/convex/_generated/dataModel";
import {
  activeHistorySubtabAtom,
  selectedStepIdAtom,
  stepPreviewInstanceAtom,
  isPreviewingAtom,
  type HistorySubtab,
} from "@/src/atoms";

type MachineStep = Doc<"machineSteps">;
type MachineTurn = Doc<"machineTurns">;

interface HistoryTabProps {
  sessionId: Id<"sessions">;
}

const subtabs: { id: HistorySubtab; label: string }[] = [
  { id: "steps", label: "Steps" },
  { id: "turns", label: "Turns" },
  { id: "messages", label: "Messages" },
];

export function HistoryTab({ sessionId }: HistoryTabProps) {
  const [activeSubtab, setActiveSubtab] = useAtom(activeHistorySubtabAtom);

  return (
    <div className="h-full flex flex-col">
      {/* Subtabs */}
      <div className="flex border-b border-terminal-green-dimmer mb-4">
        {subtabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveSubtab(tab.id)}
            className={`
              px-3 py-1 text-xs font-mono transition-colors
              ${
                activeSubtab === tab.id
                  ? "text-terminal-green border-b border-terminal-green"
                  : "text-terminal-green-dim hover:text-terminal-green"
              }
            `}
          >
            [{tab.label}]
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto terminal-scrollbar">
        {activeSubtab === "steps" && <StepsView sessionId={sessionId} />}
        {activeSubtab === "turns" && <TurnsView sessionId={sessionId} />}
        {activeSubtab === "messages" && <MessagesView sessionId={sessionId} />}
      </div>
    </div>
  );
}

function StepsView({ sessionId }: { sessionId: Id<"sessions"> }) {
  const steps = useQuery(api.machineSteps.getRecent, { sessionId, limit: 20 });
  const [selectedStepId, setSelectedStepId] = useAtom(selectedStepIdAtom);
  const setPreviewInstance = useSetAtom(stepPreviewInstanceAtom);
  const setIsPreviewing = useSetAtom(isPreviewingAtom);

  const handleStepClick = (step: MachineStep) => {
    if (selectedStepId === step._id) {
      setSelectedStepId(null);
      setPreviewInstance(null);
      setIsPreviewing(false);
    } else {
      setSelectedStepId(step._id);
      setPreviewInstance(step.instance);
      setIsPreviewing(true);
    }
  };

  const clearPreview = () => {
    setSelectedStepId(null);
    setPreviewInstance(null);
    setIsPreviewing(false);
  };

  if (!steps) {
    return <div className="text-terminal-green-dimmer">Loading...</div>;
  }

  if (steps.length === 0) {
    return <div className="text-terminal-green-dimmer italic">No steps yet</div>;
  }

  return (
    <div className="space-y-2">
      {selectedStepId && (
        <button
          onClick={clearPreview}
          className="text-xs text-terminal-yellow hover:underline mb-2"
        >
          [Clear Preview]
        </button>
      )}
      {steps.map((step) => (
        <div
          key={step._id}
          onClick={() => handleStepClick(step)}
          className={`
            p-2 rounded border cursor-pointer transition-colors
            ${
              selectedStepId === step._id
                ? "border-terminal-green bg-terminal-bg-lighter"
                : "border-terminal-green-dimmer hover:border-terminal-green-dim"
            }
          `}
        >
          <div className="flex items-center gap-2">
            <span className="text-terminal-cyan">#{step.stepNumber}</span>
            <span className="text-terminal-green-dim">{step.yieldReason}</span>
            {step.done && <span className="text-terminal-yellow">[done]</span>}
          </div>
          {step.response && (
            <div className="text-terminal-green-dimmer text-xs mt-1 truncate">
              {step.response.slice(0, 60)}...
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function TurnsView({ sessionId }: { sessionId: Id<"sessions"> }) {
  const turnTree = useQuery(api.sessions.getTurnTree, { sessionId });
  const timeTravel = useMutation(api.sessions.timeTravel);

  if (!turnTree) {
    return <div className="text-terminal-green-dimmer">Loading...</div>;
  }

  if (turnTree.turns.length === 0) {
    return <div className="text-terminal-green-dimmer italic">No turns yet</div>;
  }

  const handleTimeTravel = async (turnId: Id<"machineTurns">) => {
    await timeTravel({ sessionId, targetTurnId: turnId });
  };

  return (
    <div className="space-y-2">
      {turnTree.turns.map((turn) => {
        const isCurrent = turn._id === turnTree.currentTurnId;
        const date = new Date(turn.createdAt);
        const timeStr = date.toLocaleTimeString();

        return (
          <div
            key={turn._id}
            className={`
              p-2 rounded border
              ${
                isCurrent
                  ? "border-terminal-green bg-terminal-bg-lighter"
                  : "border-terminal-green-dimmer"
              }
            `}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-terminal-green-dim text-xs">{timeStr}</span>
                {isCurrent && <span className="text-terminal-green">[current]</span>}
              </div>
              {!isCurrent && (
                <button
                  onClick={() => handleTimeTravel(turn._id)}
                  className="text-xs text-terminal-cyan hover:underline"
                >
                  [Travel Here]
                </button>
              )}
            </div>
            <div className="text-terminal-green-dimmer text-xs mt-1">
              {turn.messages.length} messages
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MessagesView({ sessionId }: { sessionId: Id<"sessions"> }) {
  const history = useQuery(api.sessions.getFullHistory, { sessionId }) as unknown[] | undefined;

  if (!history) {
    return <div className="text-terminal-green-dimmer">Loading...</div>;
  }

  if (history.length === 0) {
    return <div className="text-terminal-green-dimmer italic">No messages yet</div>;
  }

  return (
    <div className="space-y-3">
      {history.slice(-100).map((msg, i) => {
        const message = msg as { role: string; content: unknown[] };
        return (
          <div
            key={i}
            className="p-2 rounded border border-terminal-green-dimmer"
          >
            <div className="text-terminal-cyan text-xs mb-1">{message.role}</div>
            <div className="text-xs">
              {Array.isArray(message.content) ? (
                message.content.map((block: unknown, j: number) => {
                  const b = block as { type: string; text?: string; name?: string; input?: unknown };
                  if (b.type === "text") {
                    return (
                      <div key={j} className="text-terminal-green-dim">
                        {(b.text || "").slice(0, 200)}
                        {(b.text || "").length > 200 && "..."}
                      </div>
                    );
                  }
                  if (b.type === "tool_use") {
                    return (
                      <div key={j} className="text-terminal-yellow">
                        [Tool: {b.name}]
                      </div>
                    );
                  }
                  if (b.type === "tool_result") {
                    return (
                      <div key={j} className="text-terminal-cyan">
                        [Tool Result]
                      </div>
                    );
                  }
                  if (b.type === "thinking") {
                    return (
                      <div key={j} className="text-terminal-green-dimmer italic">
                        [Thinking...]
                      </div>
                    );
                  }
                  return (
                    <div key={j} className="text-terminal-green-dimmer">
                      [{b.type}]
                    </div>
                  );
                })
              ) : (
                <div className="text-terminal-green-dim">
                  {String(message.content).slice(0, 200)}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
