import { z } from "zod";
import {
  createCharter,
  createNode,
  StandardExecutor,
  type Charter,
  type Node,
  type CodeTransition,
} from "markov-machines";
import { todoTools, type TodoState, type ArchiveState } from "./tools";

// Create executor - API key from environment
const executor = new StandardExecutor({
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: "claude-sonnet-4-20250514",
});

// State validators
export const todoStateValidator = z.object({
  todos: z.array(
    z.object({
      id: z.string(),
      text: z.string(),
      completed: z.boolean(),
    })
  ),
});

export const archiveStateValidator = z.object({
  archivedTodos: z.array(
    z.object({
      id: z.string(),
      text: z.string(),
      completed: z.boolean(),
    })
  ),
});

// Forward declarations for nodes (needed for transitions)
// Using 'any' since nodes have different state types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mainNode: Node<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let archiveNode: Node<any>;

// Transitions
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toArchive: CodeTransition<any> = {
  description: "View the archive of completed todos",
  execute: (state: TodoState) => ({
    node: archiveNode,
    state: {
      archivedTodos: state.todos.filter((t) => t.completed),
    },
  }),
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const backToMain: CodeTransition<any> = {
  description: "Return to the main todo list",
  execute: () => ({
    node: mainNode,
    state: undefined, // Use mainNode's initialState
  }),
};

// Create charter with tools and transitions
// Using 'any' for charter type since it handles multiple state types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const todoCharter: Charter<any> = createCharter({
  name: "todo-assistant",
  executor,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools: todoTools as any,
  transitions: {
    toArchive,
    backToMain,
  },
  config: {
    model: "claude-sonnet-4-20250514",
    maxTokens: 1024,
  },
});

// Create main node
mainNode = createNode(todoCharter, {
  instructions: `You are a helpful todo assistant. Help users manage their todos.

Available actions:
- Use listTodos to see current todos
- Use addTodo to create new todos
- Use completeTodo to mark a todo as done (use the todo's ID)
- Use deleteTodo to remove a todo (use the todo's ID)

You can also transition to the archive to view completed todos.

When listing todos, always show the ID so users can reference them.
Always confirm actions with the user after completing them.
Be concise and helpful.`,
  tools: [
    { ref: "listTodos" },
    { ref: "addTodo" },
    { ref: "completeTodo" },
    { ref: "deleteTodo" },
  ],
  validator: todoStateValidator,
  transitions: {
    toArchive: { ref: "toArchive" },
  },
  initialState: { todos: [] },
});

// Create archive node
archiveNode = createNode(todoCharter, {
  instructions: `You are viewing the archive of completed todos.

Available actions:
- Use listArchivedTodos to see all archived (completed) todos
- Use clearArchive to delete all archived todos

You can transition back to the main todo list when done.

Be concise and helpful.`,
  tools: [
    { ref: "listArchivedTodos" },
    { ref: "clearArchive" },
  ],
  validator: archiveStateValidator,
  transitions: {
    backToMain: { ref: "backToMain" },
  },
  initialState: { archivedTodos: [] },
});

// Re-export for external use
export { mainNode, archiveNode };

// Initial state factory
export function createInitialState(): TodoState {
  return {
    todos: [],
  };
}
