import { defineTool } from '@copilotkit/runtime/v2';
import { computerInputs, hostComputerInputs } from '../shared/computer-types.js';
import type { ComputerService } from './computer-service.js';
export function computerTools(
  service: ComputerService,
  dotId: string,
  check: () => void,
  signal: AbortSignal,
) {
  const inputs = service.hasSupervisor ? computerInputs : hostComputerInputs;
  return Object.entries(inputs)
    .filter(([name]) => !name.startsWith('human_'))
    .map(([name, parameters]) =>
      defineTool({
        name: `computer_${name}`,
        description: service.hasSupervisor
          ? `Execute container action: ${name}.`
          : `Execute native Windows host action: ${name}. Unrestricted access across all host drives (C:, D:, H:, I:, J:, etc.). Accepts absolute Windows paths (e.g. "C:\\...", "J:\\..."). For computer_exec, runs PowerShell commands asynchronously directly on the host system.`,
        parameters,
        execute: async (input: unknown) => {
          check();
          return service.action(
            dotId,
            name as any,
            input,
            'agent',
            signal,
          );
        },
      }),
    );
}
