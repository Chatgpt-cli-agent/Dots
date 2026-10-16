import { InMemoryAgentRunner } from '@copilotkit/runtime/v2';
import { EventType, type BaseEvent } from '@ag-ui/core';
import { Observable, ReplaySubject } from 'rxjs';
import { type WorkspaceStore, formatMessageForAGUI } from './workspace.js';
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
      messages,
    });

    // Pending frontend tools are restored by their saved assistant tool calls.
    // A standard interrupt requires a separate resume payload; emitting one here
    // prevents the browser from submitting the tool-result continuation.

    // If an active run is currently executing on this thread, stream live events
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
    return Promise.resolve(
      this.runCoordinator.isThreadActive(request.threadId),
    );
  }

  override stop(request: {
    threadId: string;
    runId?: string;
  }): Promise<boolean> {
    const cancelled = request.runId
      ? this.runCoordinator.cancelRun(request.runId, 'Stopped via runner')
      : this.runCoordinator.cancelThread(
          request.threadId,
          'Stopped via runner',
        );
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

  override getThreadMessages(threadId: string) {
    return this.workspace.getNativeMessages(threadId).map(formatMessageForAGUI);
  }
}
