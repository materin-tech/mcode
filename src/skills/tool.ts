/**
 * materin-mcode — terminal AI coding agent
 * Copyright (c) 2026 Materin-tech. All rights reserved.
 * SPDX-License-Identifier: MIT
 */

import type { ToolDefinition, ToolResult } from '../tools/types.js';
import { getSkillBody, type SkillDefinition } from './loader.js';

/** Layer-2 loader: model pulls the full body of a matched skill. */
export function createSkillTool(skills: SkillDefinition[]): ToolDefinition {
  return {
    name: 'skill',
    description: 'Load the full instructions of a skill by name (see the skill index).',
    isReadOnly: true,
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Skill name from the index.' },
      },
      required: ['name'],
    },
    async execute(input): Promise<ToolResult> {
      const name = String(input['name']);
      const body = getSkillBody(skills, name);
      if (body === null) {
        const known = skills.map((s) => s.name).join(', ') || '(none)';
        return { success: false, output: `error: unknown skill '${name}' (known: ${known})` };
      }
      return { success: true, output: body };
    },
  };
}
