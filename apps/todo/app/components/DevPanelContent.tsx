"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useSessionId } from "../../src/hooks";
import { useModalClose } from "./ModalContext";

type Screen = "overview" | "state" | "history" | "nodes" | "packs";

const screens: { id: Screen; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "state", label: "State" },
  { id: "history", label: "History" },
  { id: "nodes", label: "Nodes" },
  { id: "packs", label: "Packs" },
];

interface DevPanelContentProps {
  screen: Screen;
  isModal: boolean;
}

export function DevPanelContent({ screen, isModal }: DevPanelContentProps) {
  const closeModal = useModalClose();
  const [sessionId] = useSessionId(null);

  const session = useQuery(
    api.sessions.get,
    sessionId ? { id: sessionId } : "skip"
  );
  const historyTree = useQuery(
    api.sessions.getHistoryTree,
    sessionId ? { sessionId } : "skip"
  );
  const todos = useQuery(api.todos.list);

  // Keyboard shortcut to close modal
  useEffect(() => {
    if (!isModal) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeModal();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isModal, closeModal]);

  return (
    <div className="flex h-full max-h-[85vh] flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
          Dev Panel
        </h2>
        {isModal && (
          <button
            onClick={() => closeModal()}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Tab Navigation */}
      <nav className="flex gap-1 border-b border-gray-200 px-6 dark:border-gray-700">
        {screens.map((s) => (
          <Link
            key={s.id}
            href={`/dev/${s.id}`}
            replace
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              screen === s.id
                ? "border-b-2 border-blue-500 text-blue-600 dark:text-blue-400"
                : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            }`}
          >
            {s.label}
          </Link>
        ))}
      </nav>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {screen === "overview" && (
          <OverviewScreen session={session} historyTree={historyTree} todos={todos} />
        )}
        {screen === "state" && <StateScreen session={session} />}
        {screen === "history" && <HistoryScreen historyTree={historyTree} />}
        {screen === "nodes" && <NodesScreen session={session} />}
        {screen === "packs" && <PacksScreen session={session} />}
      </div>

      {/* Footer */}
      <div className="border-t border-gray-200 px-6 py-3 text-xs text-gray-400 dark:border-gray-700">
        Press <kbd className="rounded bg-gray-200 px-1 dark:bg-gray-700">Esc</kbd> to close
        {" | "}
        Session: {sessionId ?? "none"}
      </div>
    </div>
  );
}

// Types

interface SerializedInstance {
  id: string;
  node: unknown;
  state: unknown;
  child?: unknown;
  packStates?: Record<string, unknown>;
}

interface SessionData {
  sessionId: string;
  historyId: string;
  instanceId: string;
  instance: SerializedInstance;
  turn: { messages: unknown[]; createdAt: number } | null;
  createdAt: number;
}

interface HistoryEntry {
  _id: string;
  sessionId: string;
  parentId: string | null;
  instanceId: string;
  instance: SerializedInstance;
  createdAt: number;
  turn: { messages: unknown[] } | null;
}

interface HistoryTree {
  currentHistoryId: string;
  entries: HistoryEntry[];
}

// Screen Components

function OverviewScreen({
  session,
  historyTree,
  todos,
}: {
  session: unknown;
  historyTree: unknown;
  todos: unknown[] | undefined;
}) {
  const s = session as SessionData | null;
  const tree = historyTree as HistoryTree | null;
  const turnCount = tree?.entries.filter(e => e.turn !== null).length ?? 0;

  return (
    <div className="space-y-6">
      <Section title="Quick Stats">
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="Todos" value={todos?.length ?? 0} />
          <StatCard label="Turns" value={turnCount} />
          <StatCard label="Current Node" value={getNodeName(s?.instance?.node)} />
        </div>
      </Section>

      <Section title="Session Info">
        <Pre>
          {JSON.stringify(
            {
              sessionId: s?.sessionId,
              historyId: s?.historyId,
              instanceId: s?.instanceId,
              createdAt: s?.createdAt ? new Date(s.createdAt).toISOString() : null,
            },
            null,
            2
          )}
        </Pre>
      </Section>

      <Section title="Todos (from table)">
        <Pre>{JSON.stringify(todos ?? [], null, 2)}</Pre>
      </Section>
    </div>
  );
}

function StateScreen({ session }: { session: unknown }) {
  const s = session as SessionData | null;

  return (
    <div className="space-y-6">
      <Section title="Current Machine State">
        <Pre>{JSON.stringify(s?.instance?.state ?? null, null, 2)}</Pre>
      </Section>
    </div>
  );
}

function HistoryScreen({ historyTree }: { historyTree: unknown }) {
  const tree = historyTree as HistoryTree | null;
  const entries = tree?.entries ?? [];

  return (
    <div className="space-y-6">
      <Section title={`Turn History (${entries.length} entries)`}>
        {entries.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400">No history yet</p>
        ) : (
          <div className="space-y-4">
            {entries.map((entry, i) => (
              <div
                key={entry._id}
                className={`rounded border p-3 ${
                  entry._id === tree?.currentHistoryId
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                    : "border-gray-200 dark:border-gray-700"
                }`}
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium">
                    Turn {i + 1}
                    {entry._id === tree?.currentHistoryId && (
                      <span className="ml-2 text-xs text-blue-600 dark:text-blue-400">
                        (current)
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-gray-500">
                    {new Date(entry.createdAt).toLocaleTimeString()}
                  </span>
                </div>
                <div className="mb-2 text-xs text-gray-500">
                  Instance: {entry.instanceId.slice(0, 8)}...
                  {" | "}
                  Node: {getNodeName(entry.instance?.node)}
                </div>
                {entry.turn ? (
                  <Pre>{JSON.stringify(entry.turn.messages, null, 2)}</Pre>
                ) : (
                  <p className="text-xs text-gray-400">Initial state (no messages)</p>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function NodesScreen({ session }: { session: unknown }) {
  const s = session as SessionData | null;

  return (
    <div className="space-y-6">
      <Section title="Current Node">
        <Pre>{JSON.stringify(s?.instance?.node ?? null, null, 2)}</Pre>
      </Section>
      {s?.instance?.child !== undefined && (
        <Section title="Child Instance(s)">
          <Pre>{JSON.stringify(s.instance.child, null, 2)}</Pre>
        </Section>
      )}
    </div>
  );
}

function PacksScreen({ session }: { session: unknown }) {
  const s = session as SessionData | null;
  const packStates = s?.instance?.packStates ?? {};

  return (
    <div className="space-y-6">
      <Section title="Pack States">
        {Object.keys(packStates).length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400">No pack states stored</p>
        ) : (
          <Pre>{JSON.stringify(packStates, null, 2)}</Pre>
        )}
      </Section>
      <Section title="Full Instance">
        <Pre>{JSON.stringify(s?.instance ?? null, null, 2)}</Pre>
      </Section>
    </div>
  );
}

// Helper Components

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
        {title}
      </h3>
      {children}
    </div>
  );
}

function Pre({ children }: { children: React.ReactNode }) {
  return (
    <pre className="max-h-96 overflow-auto rounded bg-gray-100 p-3 text-xs text-gray-800 dark:bg-gray-900 dark:text-gray-200">
      {children}
    </pre>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-gray-100 p-4 dark:bg-gray-700">
      <div className="text-2xl font-bold text-gray-900 dark:text-white">
        {value}
      </div>
      <div className="text-sm text-gray-500 dark:text-gray-400">{label}</div>
    </div>
  );
}

function getNodeName(node: unknown): string {
  if (!node) return "none";
  if (typeof node === "object" && "ref" in node) {
    return (node as { ref: string }).ref;
  }
  return "inline";
}
