import { z } from "zod";
import {
  createCharter,
  createNode,
  createStandardExecutor,
  createTransition,
  type Charter,
  type Node,
  type CodeTransition,
} from "markov-machines";
import {
  listTodos,
  addTodo,
  completeTodo,
  deleteTodo,
  listArchivedTodos,
  clearArchive,
  type TodoState,
  type ArchiveState,
} from "./tools";
import { guidancePack } from "./packs/guidance";
import { productResearcherNode } from "./nodes/productResearcher";

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
let mainNode: Node<TodoState>;
let archiveNode: Node<ArchiveState>;

// Transitions - use type assertions for cross-state transitions
const toArchive: CodeTransition<TodoState> = {
  description: "View the archive of completed todos",
  execute: (state: TodoState) => ({
    node: archiveNode as Node<unknown>,
    state: {
      archivedTodos: state.todos.filter((t) => t.completed),
    },
  }),
};

const backToMain: CodeTransition<ArchiveState> = {
  description: "Return to the main todo list",
  execute: () => ({
    node: mainNode as Node<unknown>,
    state: undefined, // Use mainNode's initialState
  }),
};

// Create charter with single executor
export const todoCharter: Charter = createCharter({
  name: "todo-assistant",
  executor: createStandardExecutor({
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: "claude-sonnet-4-20250514",
    maxTokens: 1024,
  }),
  transitions: {
    toArchive,
    backToMain,
  },
  packs: [guidancePack],
});

// Create main node - tools are inline on the node
mainNode = createNode<TodoState>({
  instructions: `You are a helpful todo assistant. Help users manage their todos.

Available actions:
- Use listTodos to see current todos
- Use addTodo to create new todos
- Use completeTodo to mark a todo as done (use the todo's ID)
- Use deleteTodo to remove a todo (use the todo's ID)

You can also:
- Transition to the archive to view completed todos
- Spawn a product researcher to help research products for todo items
- Use setGuidance to store user preferences (e.g., "products: prefer natural materials, BIFL quality")

When listing todos, always show the ID so users can reference them.
Always confirm actions with the user after completing them.
Be concise and helpful.`,
  tools: {
    listTodos,
    addTodo,
    completeTodo,
    deleteTodo,
  },
  validator: todoStateValidator,
  transitions: {
    toArchive: { ref: "toArchive" },
    spawnResearcher: createTransition<TodoState>({
      description: "Spawn a product researcher to investigate a product. Use when user needs help researching something to buy.",
      arguments: z.object({
        query: z.string().describe("What to research (e.g., 'best wool blankets', 'durable hiking boots')"),
      }),
      execute: async (_state, _reason, args, { spawn }) => {
        return spawn({
          node: productResearcherNode,
          state: { query: args.query, findings: [] },
        });
      },
    }),
  },
  packs: [guidancePack],
  initialState: { todos: [] },
});

// Create archive node
archiveNode = createNode<ArchiveState>({
  instructions: `You are viewing the archive of completed todos.

Available actions:
- Use listArchivedTodos to see all archived (completed) todos
- Use clearArchive to delete all archived todos

You can transition back to the main todo list when done.

Be concise and helpful.`,
  tools: {
    listArchivedTodos,
    clearArchive,
  },
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
