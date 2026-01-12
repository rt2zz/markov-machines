/**
 * JSON Schema type for serialized Zod schemas.
 */
export type JSONSchema = Record<string, unknown>;

/**
 * Unified registry reference for tools, nodes, and transitions.
 */
export interface Ref {
  ref: string;
}

/**
 * Serializable node definition.
 * Used for inline node definitions in transitions or persistence.
 * Note: Only charter tool refs can be serialized. Inline node tools
 * (which have execute functions) cannot be serialized.
 */
export interface SerialNode<S = unknown> {
  instructions: string;
  charterTools: Ref[];
  validator: JSONSchema;
  transitions: Record<string, Ref | SerialTransition>;
  /** Optional initial state for this node */
  initialState?: S;
}

/**
 * Serializable transition definition.
 * References a target node and optionally defines custom arguments.
 */
export interface SerialTransition {
  description: string;
  node: Ref | SerialNode;
  arguments?: JSONSchema;
}

/**
 * Type guard for Ref
 */
export function isRef(value: unknown): value is Ref {
  return (
    typeof value === "object" &&
    value !== null &&
    "ref" in value &&
    typeof (value as Ref).ref === "string"
  );
}

/**
 * Type guard for SerialNode
 */
export function isSerialNode<S>(value: unknown): value is SerialNode<S> {
  return (
    typeof value === "object" &&
    value !== null &&
    "instructions" in value &&
    "charterTools" in value &&
    "validator" in value &&
    "transitions" in value
  );
}

/**
 * Type guard for SerialTransition
 */
export function isSerialTransition(value: unknown): value is SerialTransition {
  return (
    typeof value === "object" &&
    value !== null &&
    "description" in value &&
    "node" in value
  );
}
