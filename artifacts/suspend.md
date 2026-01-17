## Suspending

I believe we need the ability for a machine or tool to suspend. Suspend basically means the machine is not yet ready to respond to the user, but either a tool is waiting for an indeterminant response or the server needs to shut the process down and it can be resumed on another process.

I realized this in thinking how we might support human in the loop workflows - such as approval for a refund. The most basic version of this is basically a tool call that creates a approval request, then a sales agent reviews the approval request and approves or denies. That response is sent back to the machine which formats it as a tool result and continue execution. 

The framework does not need to care about any domain specifics or HITL per se, but it needs to support the basic building blocks which I believe means it needs the ability for a tool call to take indefinitely long and for the tool call to resolve outside of the current process. 

I think the simplest way to model this is to give tools the ability to suspend, and then resume later with a payload. I suspect whatever mechanism we design for tools to suspend could also be useful to allow commands or executors to be able to suspend as well. 

Please consider how we might best model this