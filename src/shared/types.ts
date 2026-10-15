export type Status =
  | 'queued'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'interrupted'
  | 'cancelled';
export interface Settings {
  name: string;
  paused: boolean;
  researchAllowed: boolean;
  memoryAllowed: boolean;
  appsAllowed: boolean;
}
export interface Task {
  id: string;
  prompt: string;
  status: Status;
  intervalSeconds: number | null;
  nextRunAt: number | null;
  createdAt: number;
  updatedAt: number;
  error: string | null;
  lease: string | null;
  leaseUntil: number | null;
}
export interface Source {
  title: string;
  url: string;
  excerpt: string;
}
export interface Result {
  text: string;
  sources: Source[];
  sample: boolean;
  screenshot?: string;
}
export interface Run {
  id: string;
  taskId: string;
  status: string;
  startedAt: number;
  finishedAt: number | null;
  result: Result | null;
  error: string | null;
}
export interface TaskEvent {
  id: number;
  taskId: string;
  runId: string | null;
  text: string;
  createdAt: number;
}
export interface Memory {
  id: string;
  text: string;
  createdAt: number;
}
export interface Detail {
  task: Task;
  runs: Run[];
  events: TaskEvent[];
}
export interface State {
  settings: Settings;
  tasks: Task[];
  memories: Memory[];
  mode: 'sample' | 'live';
  configured: boolean;
}
export type Action = 'run' | 'pause' | 'cancel';
export interface Space {
  id: string;
  name: string;
  description: string;
  createdAt: number;
}
export interface Dot {
  id: string;
  /** Default destination for saved pages, not ownership. */
  spaceId: string;
  spaceIds: string[];
  name: string;
  instructions: string;
  researchAllowed: boolean;
  memoryAllowed: boolean;
  appsAllowed: boolean;
  composioToolkits: string[];
  composioSessionId?: string | null;
  composioPolicyHash?: string | null;
  createdAt: number;
  learningContainerId?: string | null;
  skillDeliveryEnabled?: boolean;
  modelEndpoint?: string;
  modelId?: string;
  contextLimit?: number;
  maxCompletionTokens?: number;
  apiKey?: string;
  hasApiKey?: boolean;
}
export interface Conversation {
  id: string;
  dotId: string;
  ownerId: string;
  title: string;
  createdAt: number;
  updatedAt?: number;
  archivedAt?: number | null;
  metadata?: Record<string, unknown> | null;
  /** Frozen at creation; null means this conversation does not participate. */
  learningContainerId?: string | null;
}
export interface NativeMessage {
  id: string;
  threadId: string;
  role: 'user' | 'assistant' | 'system' | 'tool' | 'developer';
  content: string;
  createdAt: number;
  runId?: string | null;
  toolCalls?: Array<{
    id: string;
    type?: 'function';
    function?: { name: string; arguments: string };
    name?: string;
    args?: unknown;
  }>;
  toolCallId?: string | null;
  status?: 'pending' | 'success' | 'failed' | 'cancelled';
  metadata?: Record<string, unknown> | null;
}
export interface NativeRun {
  id: string;
  threadId: string;
  dotId: string;
  parentRunId?: string | null;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  error?: string | null;
  startedAt: number;
  finishedAt?: number | null;
  metadata?: Record<string, unknown> | null;
}
export interface NativeToolExecution {
  id: string;
  runId: string;
  threadId: string;
  toolCallId?: string | null;
  toolName: string;
  args: Record<string, unknown>;
  result?: unknown;
  status:
    | 'pending'
    | 'awaiting_approval'
    | 'approved'
    | 'rejected'
    | 'completed'
    | 'failed';
  approvalRequired: boolean;
  approved: boolean;
  error?: string | null;
  createdAt: number;
  finishedAt?: number | null;
}
export interface CallReceipt {
  anchorMessageId?: string | null;
  id: string;
  threadId: string;
  startedAt: number;
  endedAt: number | null;
  status: 'connecting' | 'active' | 'ended' | 'failed';
  transcript: string;
  error: string | null;
}
export interface SetupStatus {
  intelligence: boolean;
  model: boolean;
  browser: boolean;
  voice: boolean;
  composio: boolean;
  slack: string;
  missing: string[];
}
export interface WorkspaceState {
  spaces: Space[];
  dots: Dot[];
  conversations: Conversation[];
  setup: SetupStatus;
  calls: CallReceipt[];
}
