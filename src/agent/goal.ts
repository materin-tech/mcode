import { streamResponse } from '../api/client.js';

/** Next-round work instruction sent to the agent while a goal is active. */
export function buildGoalPrompt(goal: string): string {
  return [
    `[goal] ${goal}`,
    'Continue working toward the goal. Use tools to make real progress.',
    'If the goal is already fully achieved, reply with exactly GOAL_COMPLETE and no tool calls.',
  ].join('\n');
}

/**
 * Lightweight completion check: a separate single-shot API call asking the
 * model to judge whether the goal is achieved given the conversation state.
 * Returns true only on an explicit GOAL_COMPLETE verdict.
 */
export async function checkGoalComplete(options: {
  goal: string;
  baseURL: string;
  apiKey: string;
  model: string;
  language: string;
  signal?: AbortSignal;
}): Promise<boolean> {
  let reply = '';
  try {
    for await (const event of streamResponse({
      baseURL: options.baseURL,
      apiKey: options.apiKey,
      model: options.model,
      instructions: [
        'You are a strict completion judge. Given a goal and the work done so far (summarized by the conversation), decide:',
        '- If the goal is FULLY achieved: reply with exactly GOAL_COMPLETE',
        '- Otherwise: reply with exactly GOAL_CONTINUE',
        'Reply with one word only.',
      ].join('\n'),
      history: [],
      userInput: [
        `Goal: ${options.goal}`,
        'Judge whether the goal is fully achieved based on the conversation history above your judge instruction is not visible to you — answer GOAL_COMPLETE only if the visible work demonstrably completes the goal.',
      ].join('\n'),
      tools: [],
      signal: options.signal,
    })) {
      if (event.type === 'text_delta') reply += event.text;
      if (event.type === 'tool_call') return false;
    }
  } catch {
    return false; // judge failure → keep working (fail-open)
  }
  return /GOAL_COMPLETE/i.test(reply);
}
