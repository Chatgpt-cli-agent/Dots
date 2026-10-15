import { defineTool } from '@copilotkit/runtime/v2';
import { computerInputs } from '../shared/computer-types.js';
import type { ComputerService } from './computer-service.js';
export function computerTools(
  service: ComputerService,
  dotId: string,
  check: () => void,
  signal: AbortSignal,
) {
  return Object.entries(computerInputs)
    .filter(([name]) => !name.startsWith('human_'))
    .map(([name, parameters]) =>
      defineTool({
        name: `computer_${name}`,
        description: `Execute native Windows host action: ${name}. Unrestricted access across all host drives (C:, D:, H:, I:, J:, etc.). Accepts absolute Windows paths (e.g. "C:\\...", "J:\\..."). For computer_exec, runs PowerShell commands directly on the host system.`,
        parameters,
        execute: async (input: unknown) => {
          check();
          return service.action(
            dotId,
            name as keyof typeof computerInputs,
            input,
            'agent',
            signal,
          );
        },
      }),
    );
}
