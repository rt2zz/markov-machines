/**
 * Text content block (simplified for storage).
 */
export interface TextBlock {
  type: "text";
  text: string;
}

/**
 * Tool use content block (from assistant).
 */
export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}

/**
 * Thinking content block (simplified for storage).
 */
export interface ThinkingBlock {
  type: "thinking";
  thinking: string;
}

/**
 * Tool result content block (in user message).
 */
export interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

/**
 * Output block from structured output.
 * Contains the mapped application message.
 * @typeParam M - The application message type (defaults to unknown).
 */
export interface OutputBlock<M = unknown> {
  type: "output";
  data: M;
}

/**
 * Union of all content block types.
 * @typeParam M - The application message type for OutputBlock (defaults to unknown).
 */
export type ContentBlock<M = unknown> =
  | TextBlock
  | ToolUseBlock
  | ThinkingBlock
  | ToolResultBlock
  | OutputBlock<M>;

/**
 * Check if a content block is an OutputBlock.
 */
export function isOutputBlock<M>(
  block: ContentBlock<M>,
): block is OutputBlock<M> {
  return block.type === "output";
}

/**
 * Message in the conversation history.
 * Matches Anthropic SDK format.
 * @typeParam M - The application message type for OutputBlock (defaults to unknown).
 */
export interface Message<M = unknown> {
  role: "user" | "assistant";
  content: string | ContentBlock<M>[];
}

/**
 * Create a user message.
 */
export function userMessage<M = unknown>(
  content: string | ContentBlock<M>[],
): Message<M> {
  return { role: "user", content };
}

/**
 * Create an assistant message.
 */
export function assistantMessage<M = unknown>(
  content: string | ContentBlock<M>[],
): Message<M> {
  return { role: "assistant", content };
}

/**
 * Create a tool result block.
 */
export function toolResult(
  toolUseId: string,
  content: string,
  isError?: boolean
): ToolResultBlock {
  return {
    type: "tool_result",
    tool_use_id: toolUseId,
    content,
    ...(isError !== undefined && { is_error: isError }),
  };
}

/**
 * Extract text from a message's content.
 */
export function getMessageText<M = unknown>(message: Message<M>): string {
  if (typeof message.content === "string") {
    return message.content;
  }
  return message.content
    .filter((block): block is TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
}
