import { Subject } from 'rxjs';
import type { BaseEvent } from '@ag-ui/core';

export interface ActiveRun {
  runId: string;
  threadId: string;
  dotId: string;
  abortController: AbortController;
  agent?: { abortRun(): void };
  eventSubject: Subject<BaseEvent>;
  startedAt: number;
}

export class RunCoordinator {
  private activeRunsByThread = new Map<string, ActiveRun>();
  private activeRunsById = new Map<string, ActiveRun>();

  register(
    threadId: string,
    runId: string,
    dotId: string,
    abortController: AbortController,
    agent?: { abortRun(): void },
  ): ActiveRun {
    // Cancel any prior active run on this thread, excluding this runId
    this.cancelThread(threadId, 'Superseded by a new run on this thread.', runId);

    const activeRun: ActiveRun = {
      runId,
      threadId,
      dotId,
      abortController,
      agent,
      eventSubject: new Subject<BaseEvent>(),
      startedAt: Date.now(),
    };

    this.activeRunsByThread.set(threadId, activeRun);
    this.activeRunsById.set(runId, activeRun);
    return activeRun;
  }

  getActiveRun(threadId: string): ActiveRun | undefined {
    return this.activeRunsByThread.get(threadId);
  }

  getActiveRunById(runId: string): ActiveRun | undefined {
    return this.activeRunsById.get(runId);
  }

  broadcastEvent(runId: string, event: BaseEvent): void {
    const run = this.activeRunsById.get(runId);
    if (run && !run.eventSubject.closed) {
      run.eventSubject.next(event);
    }
  }

  completeRun(runId: string): void {
    const run = this.activeRunsById.get(runId);
    if (run) {
      if (!run.eventSubject.closed) {
        run.eventSubject.complete();
      }
      this.activeRunsById.delete(runId);
      if (this.activeRunsByThread.get(run.threadId)?.runId === runId) {
        this.activeRunsByThread.delete(run.threadId);
      }
    }
  }

  cancelThread(
    threadId: string,
    reason = 'Run cancelled.',
    excludeRunId?: string,
  ): boolean {
    const existing = this.activeRunsByThread.get(threadId);
    if (!existing) return false;
    if (excludeRunId && existing.runId === excludeRunId) return false;

    this.activeRunsByThread.delete(threadId);
    this.activeRunsById.delete(existing.runId);

    try {
      existing.abortController.abort(new Error(reason));
    } catch {}

    try {
      existing.agent?.abortRun();
    } catch {}

    if (!existing.eventSubject.closed) {
      existing.eventSubject.complete();
    }
    return true;
  }

  cancelRun(runId: string, reason = 'Run cancelled.'): boolean {
    const existing = this.activeRunsById.get(runId);
    if (!existing) return false;
    return this.cancelThread(existing.threadId, reason);
  }

  isThreadActive(threadId: string): boolean {
    return this.activeRunsByThread.has(threadId);
  }
}

export const globalRunCoordinator = new RunCoordinator();
