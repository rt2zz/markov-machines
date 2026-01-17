How can we allow tool calls to be the method of reply? this is useful if a tool call has a determistic response, or if the node wants to have some one off structured response for certain situations. 

I think the simplest way to model this is to allow a tool call to generate a response. In this case we need a way to map the tool response to the machine response, and we need to ensure or at least encourage the LLM to end the turn when it calls one of these terminal tools. 

Please consider this concept, and suggest alternative strategies if you can think of any?

If we go with this strategy then I believe the core change is allowing tools to formulate machine responses.