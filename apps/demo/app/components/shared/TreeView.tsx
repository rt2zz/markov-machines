"use client";

interface SerializedInstance {
  id: string;
  node: { ref?: string; instructions?: string } | string;
  state: unknown;
  children?: SerializedInstance[];
  packStates?: Record<string, unknown>;
  suspended?: { reason: string };
}

interface TreeViewProps {
  instance: SerializedInstance;
  depth?: number;
  isLast?: boolean;
}

export function TreeView({ instance, depth = 0, isLast = true }: TreeViewProps) {
  const nodeName = typeof instance.node === "string"
    ? instance.node
    : instance.node.ref ?? "inline";

  const statePreview = JSON.stringify(instance.state).slice(0, 50);
  const isSuspended = !!instance.suspended;

  const prefix = depth === 0 ? "" : isLast ? "└── " : "├── ";
  const indent = "    ".repeat(depth);

  return (
    <div className="font-mono text-sm">
      <div className="flex items-start">
        <span className="text-terminal-green-dimmer">{indent}{prefix}</span>
        <span className={`${isSuspended ? "text-terminal-yellow" : "text-terminal-green"}`}>
          {nodeName}
        </span>
        <span className="text-terminal-green-dim ml-2 truncate max-w-[200px]">
          {statePreview}
        </span>
        {isSuspended && (
          <span className="text-terminal-yellow ml-2">[SUSPENDED]</span>
        )}
      </div>

      {/* Pack states (only on root) */}
      {instance.packStates && Object.keys(instance.packStates).length > 0 && (
        <div>
          {Object.entries(instance.packStates).map(([packName, packState]) => (
            <div key={packName} className="flex items-start">
              <span className="text-terminal-green-dimmer">
                {indent}    [pack: {packName}]
              </span>
              <span className="text-terminal-cyan ml-2 truncate max-w-[200px]">
                {JSON.stringify(packState).slice(0, 40)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Children */}
      {instance.children && instance.children.length > 0 && (
        <div>
          {instance.children.map((child, i) => (
            <TreeView
              key={child.id}
              instance={child}
              depth={depth + 1}
              isLast={i === instance.children!.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
