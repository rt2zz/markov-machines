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
 * Union of all content block types.
 */
export type ContentBlock =
  | TextBlock
  | ToolUseBlock
  | ThinkingBlock
  | ToolResultBlock;

/**
 * Message in the conversation history.
 * Matches Anthropic SDK format.
 */
export interface Message {
  role: "user" | "assistant";
  content: string | ContentBlock[];
}

/**
 * Create a user message.
 */
export function userMessage(content: string | ContentBlock[]): Message {
  return { role: "user", content };
}

/**
 * Create an assistant message.
 */
export function assistantMessage(content: string | ContentBlock[]): Message {
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
export function getMessageText(message: Message): string {
  if (typeof message.content === "string") {
    return message.content;
  }
  return message.content
    .filter((block): block is TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
}
