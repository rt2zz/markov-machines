## Machine Clients
MM framework needs to support some ability for clients (js running in browser or react-native) to be able to understand and interact with the node / machine on a limited basis.

### Concept
The general concept is that a machine instance can be turned into a clientInstance, which has: id, state, packStates, and clientNode (the client compatible aspect of the node: instructions + validator + commands).

## Methods and type safety
For this to work, we need to be able to create a serialized clientInstance, send that over the wire, then hydrate it on the client. It is important that type safety works. For example if a convex query returns a message with a dryClientInstance on it `return { text: "hellow world", dryClientInstance: createDryClientInstance(fooInstance) }` where fooInstance is an instance of FooNode, then the type on dryClientInstance should be properly parameterized so that later when the client calls `hydrateClientInstance(dryClientInstance)` it has the proper ClientInstance<FooNode> type. Don't take these methods or types as verbatim instruction, I am just trying to demonstrate how the type safety should carry through the hydrate/dehydrate process.

## Commands
Client instances should have a client node on them, and client nodes should have commands on it. Commands here are functions that take the command.inputSchema as an argument and return an object representing the command. This object is a special object that can be passed as an input to runMachine and will execute the command on the machine directly without going through the executor first. After the command completes then the machine continues to run per normal.