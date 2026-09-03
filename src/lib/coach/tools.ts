/**
 * Gemini Interactions API tool declarations for the coach.
 *
 * These are the function declarations passed to the model so it can invoke
 * goal-intelligence actions directly from the chat. The server executes
 * the actual actions and feeds results back to the model for a final response.
 */

export interface GeminiFunctionDeclaration {
  type: "function"
  name: string
  description: string
  parameters: {
    type: "object"
    properties: Record<string, { type: string; description?: string; enum?: string[] }>
    required: string[]
  }
}

export interface GeminiTool {
  function_declarations: GeminiFunctionDeclaration[]
}

export const COACH_TOOLS: GeminiTool[] = [
  {
    function_declarations: [
      {
        type: "function",
        name: "decompose_goal",
        description:
          "Generate a full personalized journey for a goal: phases with objectives, milestones, and quests. " +
          "Use this when the user asks to decompose, plan, break down, or create a journey for a specific goal. " +
          "The proposal is reviewed before anything is created.",
        parameters: {
          type: "object",
          properties: {
            goalId: { type: "string", description: "The unique goal ID from the GOAL INTELLIGENCE block" },
            goalTitle: { type: "string", description: "The goal title for context" },
          },
          required: ["goalId"],
        },
      },
      {
        type: "function",
        name: "understand_goal",
        description:
          "Generate an AI synthesis of a goal's current state, trajectory, risks, opportunities, and open questions. " +
          "Use this when the user asks to understand, analyze, or get insight into a specific goal.",
        parameters: {
          type: "object",
          properties: {
            goalId: { type: "string", description: "The unique goal ID from the GOAL INTELLIGENCE block" },
            goalTitle: { type: "string", description: "The goal title for context" },
          },
          required: ["goalId"],
        },
      },
      {
        type: "function",
        name: "create_journey",
        description:
          "Create a phase journey for a goal with custom phase titles. " +
          "Use this when the user asks to create, set up, or start a journey for a goal. " +
          "The coach should suggest 3-5 meaningful phase titles based on the goal.",
        parameters: {
          type: "object",
          properties: {
            goalId: { type: "string", description: "The unique goal ID from the GOAL INTELLIGENCE block" },
            goalTitle: { type: "string", description: "The goal title for context" },
            titles: {
              type: "string",
              description:
                "Comma-separated phase titles (3-5 recommended). " +
                'Example: "Foundations, Practice, Depth, Mastery"',
            },
          },
          required: ["goalId", "titles"],
        },
      },
    ],
  },
]

/** Names of all tools the coach can invoke. */
export const COACH_TOOL_NAMES = COACH_TOOLS[0].function_declarations.map((f) => f.name)
