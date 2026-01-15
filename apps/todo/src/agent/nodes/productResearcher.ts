import { z } from "zod";
import {
  createNode,
  type AnthropicBuiltinTool,
  type CodeTransition,
} from "markov-machines";
import { guidancePack } from "../packs/guidance";

/**
 * Product researcher node - researches products using web search.
 * Spawned from main node, cedes back with findings.
 */

const researcherStateValidator = z.object({
  query: z.string(),
  findings: z.array(z.string()),
});

export type ResearcherState = z.infer<typeof researcherStateValidator>;

// Anthropic's built-in web search tool
const webSearchTool: AnthropicBuiltinTool = {
  type: "anthropic-builtin",
  name: "web_search",
  builtinType: "web_search_20250305",
};

export const productResearcherNode = createNode<ResearcherState>({
  instructions: `You are a product research assistant. Research the product specified in your query using web search.

Your job:
1. Use web_search to find information about products matching the query
2. Look for options, features, prices, reviews, and comparisons
3. Use recordFinding to save important findings as you go
4. Check the guidance pack for user preferences (materials, quality, budget, etc.)

When you have gathered enough information OR need clarification from the user, use cedeResults to return your findings to the main assistant.

Be thorough but focused. Prioritize findings that match the user's preferences from the guidance pack.`,
  validator: researcherStateValidator,
  tools: {
    web_search: webSearchTool,
    recordFinding: {
      name: "recordFinding",
      description: "Record an important research finding. Call this for each significant piece of information.",
      inputSchema: z.object({
        finding: z.string().describe("The finding to record (product name, price, feature, review summary, etc.)"),
      }),
      execute: (input, ctx) => {
        ctx.updateState({
          findings: [...ctx.state.findings, input.finding],
        });
        return `Finding recorded (${ctx.state.findings.length} total)`;
      },
    },
  },
  transitions: {
    cedeResults: {
      description: "Return findings to the main assistant. Use when research is complete or you need user input.",
      execute: async (state, _ctx, { cede }) => {
        return cede({
          query: state.query,
          findings: state.findings,
        });
      },
    } as CodeTransition<ResearcherState>,
  },
  packs: [guidancePack],
  initialState: { query: "", findings: [] },
});
