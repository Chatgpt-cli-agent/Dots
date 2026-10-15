import { EventType, type BaseEvent } from '@ag-ui/core';
import { randomUUID } from 'node:crypto';

export interface AccumulatedMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool' | 'developer' | 'system';
  content: string;
  toolCalls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
  toolCallId?: string;
}

export interface AccumulatedToolCall {
  toolCallId: string;
  toolName: string;
  argsString: string;
  result?: unknown;
  status: 'pending' | 'completed' | 'failed' | 'awaiting_approval';
  error?: string;
  parentMessageId?: string;
}

export class ProtocolAccumulator {
  private activeMessageId: string | null = null;
  private messageBuffers = new Map<
    string,
    {
      id: string;
      role: AccumulatedMessage['role'];
      chunks: string[];
      toolCalls?: AccumulatedMessage['toolCalls'];
      toolCallId?: string;
      completed: boolean;
    }
  >();
  private messageOrder: string[] = [];

  private toolCalls = new Map<string, AccumulatedToolCall>();
  private runError: Error | null = null;
  private isFinished = false;

  processEvent(event: BaseEvent): void {
    const ev = event as any;
    const type = ev.type;

    if (type === EventType.RUN_ERROR) {
      const msg = ev.message || 'Agent run error';
      this.runError = new Error(msg);
      return;
    }

    if (type === EventType.RUN_FINISHED) {
      this.isFinished = true;
      // Mark all unclosed message buffers as completed
      for (const buffer of this.messageBuffers.values()) {
        buffer.completed = true;
      }
      return;
    }

    // Text message start
    if (type === EventType.TEXT_MESSAGE_START) {
      const messageId = ev.messageId || randomUUID();
      this.activeMessageId = messageId;
      if (!this.messageBuffers.has(messageId)) {
        this.messageBuffers.set(messageId, {
          id: messageId,
          role: ev.role || 'assistant',
          chunks: [],
          completed: false,
        });
        this.messageOrder.push(messageId);
      }
      return;
    }

    // Text message content / chunk
    if (
      type === EventType.TEXT_MESSAGE_CONTENT ||
      type === EventType.TEXT_MESSAGE_CHUNK
    ) {
      const text =
        typeof ev.delta === 'string'
          ? ev.delta
          : typeof ev.content === 'string'
            ? ev.content
            : '';
      if (!text) return;

      const messageId = ev.messageId || this.activeMessageId || randomUUID();
      if (!this.messageBuffers.has(messageId)) {
        this.messageBuffers.set(messageId, {
          id: messageId,
          role: ev.role || 'assistant',
          chunks: [],
          completed: false,
        });
        this.messageOrder.push(messageId);
      }
      this.activeMessageId = messageId;
      this.messageBuffers.get(messageId)!.chunks.push(text);
      return;
    }

    // Text message end
    if (type === EventType.TEXT_MESSAGE_END) {
      const messageId = ev.messageId || this.activeMessageId;
      if (messageId && this.messageBuffers.has(messageId)) {
        this.messageBuffers.get(messageId)!.completed = true;
      }
      if (this.activeMessageId === messageId) {
        this.activeMessageId = null;
      }
      return;
    }

    // Tool call start
    if (type === EventType.TOOL_CALL_START) {
      const toolCallId = ev.toolCallId || randomUUID();
      const toolName = ev.toolCallName || ev.name || 'tool';
      const parentMessageId = ev.parentMessageId;
      this.toolCalls.set(toolCallId, {
        toolCallId,
        toolName,
        argsString: '',
        status: 'pending',
        parentMessageId,
      });

      // Attach tool call to active/parent message, creating an implicit assistant buffer if missing
      let targetMessageId = parentMessageId || this.activeMessageId;
      if (!targetMessageId) {
        targetMessageId = randomUUID();
        this.activeMessageId = targetMessageId;
      }
      if (!this.messageBuffers.has(targetMessageId)) {
        this.messageBuffers.set(targetMessageId, {
          id: targetMessageId,
          role: 'assistant',
          chunks: [],
          completed: false,
        });
        this.messageOrder.push(targetMessageId);
      }
      const buf = this.messageBuffers.get(targetMessageId)!;
      buf.toolCalls = buf.toolCalls || [];
      const existingCall = buf.toolCalls.find((t) => t.id === toolCallId);
      if (!existingCall) {
        buf.toolCalls.push({
          id: toolCallId,
          type: 'function',
          function: { name: toolName, arguments: '' },
        });
      }
      return;
    }

    // Tool call args
    if (type === EventType.TOOL_CALL_ARGS || type === EventType.TOOL_CALL_CHUNK) {
      const toolCallId = ev.toolCallId;
      const delta =
        typeof ev.delta === 'string'
          ? ev.delta
          : typeof ev.args === 'string'
            ? ev.args
            : typeof ev.arguments === 'string'
              ? ev.arguments
              : '';
      if (toolCallId && this.toolCalls.has(toolCallId) && delta) {
        const tc = this.toolCalls.get(toolCallId)!;
        tc.argsString += delta;
        // Update in parent message buffer
        let updated = false;
        const targetMessageId = tc.parentMessageId || this.activeMessageId;
        if (targetMessageId && this.messageBuffers.has(targetMessageId)) {
          const buf = this.messageBuffers.get(targetMessageId)!;
          const match = buf.toolCalls?.find((t) => t.id === toolCallId);
          if (match) {
            match.function.arguments = tc.argsString;
            updated = true;
          }
        }
        if (!updated) {
          for (const buf of this.messageBuffers.values()) {
            const match = buf.toolCalls?.find((t) => t.id === toolCallId);
            if (match) {
              match.function.arguments = tc.argsString;
              break;
            }
          }
        }
      }
      return;
    }

    // Tool call end
    if (type === EventType.TOOL_CALL_END) {
      const toolCallId = ev.toolCallId;
      if (toolCallId && this.toolCalls.has(toolCallId)) {
        const tc = this.toolCalls.get(toolCallId)!;
        for (const buf of this.messageBuffers.values()) {
          const match = buf.toolCalls?.find((t) => t.id === toolCallId);
          if (match) {
            match.function.arguments = tc.argsString;
            break;
          }
        }
      }
      return;
    }

    // Tool call result
    if (type === EventType.TOOL_CALL_RESULT) {
      const toolCallId = ev.toolCallId;
      const content =
        typeof ev.content === 'string'
          ? ev.content
          : JSON.stringify(ev.content ?? '');
      if (toolCallId && this.toolCalls.has(toolCallId)) {
        const tc = this.toolCalls.get(toolCallId)!;
        tc.result = ev.content;
        tc.status = 'completed';
      }

      const msgId = ev.messageId || randomUUID();
      this.messageBuffers.set(msgId, {
        id: msgId,
        role: 'tool',
        chunks: [content],
        toolCallId,
        completed: true,
      });
      this.messageOrder.push(msgId);
      return;
    }
  }

  getMessages(): AccumulatedMessage[] {
    const result: AccumulatedMessage[] = [];
    for (const id of this.messageOrder) {
      const buf = this.messageBuffers.get(id);
      if (!buf) continue;
      const content = buf.chunks.join('');
      // If message has content or toolCalls or is role tool
      if (content || (buf.toolCalls && buf.toolCalls.length > 0) || buf.role === 'tool') {
        result.push({
          id: buf.id,
          role: buf.role,
          content,
          toolCalls: buf.toolCalls,
          toolCallId: buf.toolCallId,
        });
      }
    }
    return result;
  }

  getAssistantText(): string {
    const assistantMessages = this.getMessages().filter(
      (m) => m.role === 'assistant',
    );
    return assistantMessages.map((m) => m.content).join('\n').trim();
  }

  getToolCalls(): AccumulatedToolCall[] {
    return Array.from(this.toolCalls.values());
  }

  getError(): Error | null {
    return this.runError;
  }

  hasError(): boolean {
    return this.runError !== null;
  }

  isDone(): boolean {
    return this.isFinished;
  }
}
