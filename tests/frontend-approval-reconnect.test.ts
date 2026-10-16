import { AbstractAgent } from '@ag-ui/client';
import { EventType, type RunAgentInput } from '@ag-ui/core';
import { concat, of } from 'rxjs';
import { expect, it } from 'vitest';
import { NativeAgentRunner } from '../src/server/native-runner.js';
import { WorkspaceStore } from '../src/server/workspace.js';

for (const approved of [true, false]) {
  it(`allows the actual browser protocol to submit approved=${approved} after reconnect`, async () => {
    const workspace = new WorkspaceStore(':memory:', 'owner');
    try {
      const dot = workspace.dots()[0];
      workspace.bindThread('thread', dot.id, 'Approval');
      workspace.createRun({ id: 'old-run', threadId: 'thread', dotId: dot.id });
      workspace.createToolExecution({
        id: 'execution',
        runId: 'old-run',
        threadId: 'thread',
        toolCallId: 'call',
        toolName: 'request_connection_action',
        args: { approvalId: 'approval', summary: 'Write note' },
        approvalRequired: true,
        status: 'awaiting_approval',
      });
      workspace.saveMessage('thread', 'assistant', '', {
        id: 'assistant',
        toolCalls: [
          {
            id: 'call',
            type: 'function',
            function: {
              name: 'request_connection_action',
              arguments: '{"approvalId":"approval","summary":"Write note"}',
            },
          },
        ],
      });
      const runner = new NativeAgentRunner({ workspace });
      let continued = false;
      class BrowserAgent extends AbstractAgent {
        protected override connect() {
          return concat(
            of({
              type: EventType.RUN_STARTED,
              threadId: 'thread',
              runId: 'reconnect',
            }),
            runner.connect({ threadId: 'thread' }),
          );
        }
        run(input: RunAgentInput) {
          continued = true;
          expect(
            input.messages.some(
              (m) => m.role === 'tool' && m.toolCallId === 'call',
            ),
          ).toBe(true);
          return of(
            {
              type: EventType.RUN_STARTED,
              threadId: 'thread',
              runId: input.runId,
            },
            {
              type: EventType.RUN_FINISHED,
              threadId: 'thread',
              runId: input.runId,
            },
          );
        }
      }
      const browser = new BrowserAgent({ threadId: 'thread' });
      await browser.connectAgent();
      expect(browser.messages[0].role).toBe('assistant');
      browser.addMessage({
        id: 'result',
        role: 'tool',
        toolCallId: 'call',
        content: JSON.stringify({ approved }),
      });
      await browser.runAgent();
      expect(continued).toBe(true);
      expect(browser.pendingInterrupts).toHaveLength(0);
    } finally {
      workspace.close();
    }
  });
}
