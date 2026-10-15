import { InMemoryAgentRunner, type AgentRunnerRunRequest } from '@copilotkit/runtime/v2';
import { EventType, type BaseEvent } from '@ag-ui/core';
import { Observable, ReplaySubject } from 'rxjs';
import { randomUUID } from 'node:crypto';
import {
  type WorkspaceStore,
  type NativeMessage,
  formatMessageForAGUI,
} from './workspace.js';
import { globalRunCoordinator, RunCoordinator } from './run-coordinator.js';

export interface NativeAgentRunnerOptions {
  workspace: WorkspaceStore;
  runCoordinator?: RunCoordinator;
}

export class NativeAgentRunner extends InMemoryAgentRunner {
  readonly ɵsupportsLocalThreadEndpoints = true;
  private workspace: WorkspaceStore;
  private runCoordinator: RunCoordinator;

  constructor(options: NativeAgentRunnerOptions) {
    super();
    this.workspace = options.workspace;
    this.runCoordinator = options.runCoordinator ?? globalRunCoordinator;
  }

  override connect(request: {
    threadId: string;
    agentId?: string;
  }): Observable<BaseEvent> {
    const threadId = request.threadId;
    const connectionSubject = new ReplaySubject<BaseEvent>(Infinity);

    // 1. Load authoritative database messages from SQLite formatted for AG-UI
    const rawMessages = this.workspace.getNativeMessages(threadId);
    const messages = rawMessages.map(formatMessageForAGUI);

    // 2. Emit MESSAGES_SNAPSHOT event
    connectionSubject.next({
      type: EventType.MESSAGES_SNAPSHOT,
      messages: messages as any,
    } as any);

    // 3. Check for any pending tool approval on this thread
    const pendingExecutions = this.workspace.getToolExecutions(threadId);
    const hasToolResultForCall = (callId?: string | null) =>
      !callId
        ? false
        : rawMessages.some(
            (m) =>
              m.role === 'tool' &&
              (m.toolCallId === callId || (m as any).tool_call_id === callId),
          );
    const pendingApproval = pendingExecutions.find(
      (exec) =>
        exec.status === 'awaiting_approval' &&
        !exec.approved &&
        !hasToolResultForCall(exec.toolCallId),
    );

    if (pendingApproval) {
      connectionSubject.next({
        type: EventType.RUN_FINISHED,
        threadId,
        runId: pendingApproval.runId || randomUUID(),
        outcome: {
          type: 'interrupt',
          interrupts: [
            {
              id: pendingApproval.id,
              reason: `Approval required for ${pendingApproval.toolName}`,
              name: pendingApproval.toolName,
              toolCallId: pendingApproval.toolCallId ?? undefined,
              args: pendingApproval.args,
              metadata: {
                name: pendingApproval.toolName,
                args: pendingApproval.args,
              },
            },
          ],
        },
      } as any);
    }

    // 4. If an active run is currently executing on this thread, stream live events
    const activeRun = this.runCoordinator.getActiveRun(threadId);
    if (activeRun && !activeRun.eventSubject.closed) {
      activeRun.eventSubject.subscribe({
        next: (ev) => connectionSubject.next(ev),
        error: (err) => connectionSubject.error(err),
        complete: () => connectionSubject.complete(),
      });
    } else {
      connectionSubject.complete();
    }

    return connectionSubject.asObservable();
  }

  override isRunning(request: { threadId: string }): Promise<boolean> {
    return Promise.resolve(this.runCoordinator.isThreadActive(request.threadId));
  }

  override stop(request: { threadId: string; runId?: string }): Promise<boolean> {
    const cancelled = request.runId
      ? this.runCoordinator.cancelRun(request.runId, 'Stopped via runner')
      : this.runCoordinator.cancelThread(request.threadId, 'Stopped via runner');
    return Promise.resolve(cancelled);
  }

  override listThreads(): any[] {
    return this.workspace.conversations(true).map((t) => ({
      id: t.id,
      name: t.title,
      agentId: t.dotId,
      createdAt: new Date(t.createdAt).toISOString(),
      updatedAt: new Date(t.updatedAt ?? t.createdAt).toISOString(),
      archived: Boolean(t.archivedAt),
    }));
  }

  override getThreadMessages(threadId: string): any[] {
    return this.workspace.getNativeMessages(threadId).map(formatMessageForAGUI);
  }
}
