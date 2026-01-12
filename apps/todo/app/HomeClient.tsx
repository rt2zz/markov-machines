"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "../convex/_generated/api";
import { useSessionId } from "../src/hooks";
import { ChatMessage } from "./components/ChatMessage";
import { ChatInput } from "./components/ChatInput";
import type { Id } from "../convex/_generated/dataModel";

export function HomeClient({
  initialSessionId,
}: {
  initialSessionId: Id<"sessions"> | null;
}) {
  const [sessionId, setSessionId] = useSessionId(initialSessionId);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const createSession = useAction(api.chat.createSession);
  const sendMessage = useAction(api.chat.send);
  const messages = useQuery(
    api.messages.list,
    sessionId ? { sessionId } : "skip"
  );
  const todos = useQuery(api.todos.list);

  // Create session on mount if none exists
  useEffect(() => {
    if (sessionId) return;
    async function init() {
      const id = await createSession();
      setSessionId(id);
    }
    init();
  }, [sessionId, createSession, setSessionId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (message: string) => {
    if (!sessionId) return;
    setSending(true);
    try {
      await sendMessage({ sessionId, message });
    } catch (error) {
      console.error("Error sending message:", error);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Sidebar - Todo List */}
      <aside className="w-80 border-r border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
        <h2 className="mb-4 text-xl font-semibold text-gray-900 dark:text-white">
          Todos
        </h2>
        {todos && todos.length > 0 ? (
          <ul className="space-y-2">
            {todos.map((todo) => (
              <li
                key={todo._id}
                className={`rounded-lg p-3 ${todo.completed
                  ? "bg-green-50 dark:bg-green-900/20"
                  : "bg-gray-50 dark:bg-gray-700"
                  }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`${todo.completed
                      ? "text-green-600 dark:text-green-400"
                      : "text-gray-700 dark:text-gray-300"
                      }`}
                  >
                    {todo.completed ? "✓" : "○"}
                  </span>
                  <span
                    className={`${todo.completed
                      ? "text-gray-500 line-through"
                      : "text-gray-900 dark:text-white"
                      }`}
                  >
                    {todo.text}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-gray-500 dark:text-gray-400">
            No todos yet. Chat with the assistant to add some!
          </p>
        )}
      </aside>

      {/* Main Chat Area */}
      <main className="flex flex-1 flex-col">
        {/* Header */}
        <header className="border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-700 dark:bg-gray-800">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Todo Assistant
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Powered by Markov Machines
          </p>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-2xl space-y-4">
            {!sessionId && (
              <p className="text-center text-gray-500">Loading...</p>
            )}
            {messages?.map((msg) => (
              <ChatMessage
                key={msg._id}
                role={msg.role}
                content={msg.content}
              />
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="rounded-lg bg-gray-200 px-4 py-2 dark:bg-gray-700">
                  <p className="text-gray-500 dark:text-gray-400">
                    Thinking...
                  </p>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input */}
        <div className="border-t border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <div className="mx-auto max-w-2xl">
            <ChatInput onSend={handleSend} disabled={!sessionId || sending} />
          </div>
        </div>
      </main>
    </div>
  );
}
