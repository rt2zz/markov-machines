import { z } from "zod";
import {
    createCharter,
    createNode,
    createStandardExecutor,
    createVesselExecutor,
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

// Transitions - use type assertions for cross-state transitions
const toArchive: CodeTransition<TodoState> = {
    description: "View the archive of completed todos",
    execute: (state: TodoState) => ({
        node: archiveNode,
        state: {
            archivedTodos: state.todos.filter((t) => t.completed),
        },
    }),
};

const backToMain: CodeTransition<ArchiveState> = {
    description: "Return to the main todo list",
    execute: () => ({
        node: mainNode,
        state: undefined, // Use mainNode's initialState
    }),
};

// Create charter with executors registry
export const todoCharter = createCharter({
    name: "todo-assistant",
    executors: {
        standard: createStandardExecutor({
            apiKey: process.env.ANTHROPIC_API_KEY,
            model: "claude-sonnet-4-20250514",
        }),
    },
    transitions: {
        toArchive,
        backToMain,
    },
    config: {
        model: "claude-sonnet-4-20250514",
        maxTokens: 1024,
    },
});


let a = {
    node
    state
    child: {
        node,
        state,
        child: [{
            node,
            state,
            child: undefined
        },
        {
            node,
            state,
            child: undefined
        }]
    }
}

const rootNode = createNode({

})

// Create main node - tools are now inline on the node
const mainNode = createNode<TodoState>({
    executor: { ref: "standard" },
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
    tools: {
        listTodos,
        addTodo,
        completeTodo,
        deleteTodo,
    },
    validator: todoStateValidator,
    transitions: {
        toArchive: { ref: "toArchive" },
    },
    initialState: { todos: [] },
});

// Create archive node
const archiveNode = createNode<ArchiveState>({
    executor: { ref: "standard" },
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
