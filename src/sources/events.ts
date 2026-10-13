import type { Role } from '../data/types';

/**
 * The office only reacts to these events. MockSource emits them today; a
 * ClaudeSource (hooks → local bridge) will emit the same ones later.
 */
export type OfficeEvent =
  | { type: 'agent.spawn'; agentId: string; lineId: string; formId?: string; role: Role; name?: string }
  | { type: 'agent.remove'; agentId: string }
  | { type: 'task.assigned'; agentId: string; taskId: string; title: string }
  | { type: 'task.progress'; agentId: string; progress: number }
  | { type: 'agent.state'; agentId: string; state: 'thinking' | 'working' | 'waiting_input' | 'blocked' }
  | { type: 'task.done'; agentId: string; taskId: string; ok: boolean };

export type Emit = (e: OfficeEvent) => void;
