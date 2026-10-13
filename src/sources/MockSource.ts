import type { Emit } from './events';

const TASKS = [
  'Refactor auth module', 'Write unit tests', 'Review PR #42', 'Research vector DBs',
  'Fix flaky CI job', 'Plan sprint backlog', 'Update API docs', 'Migrate DB schema',
  'Profile render loop', 'Triage bug reports', 'Draft release notes', 'Add dark mode',
];

/** Fake activity so the office feels alive. Time is scaled by `speed`. */
export class MockSource {
  speed = 1;
  private busy = new Set<string>();
  private timer = 0;
  private n = 0;

  constructor(private emit: Emit, private agents: () => string[]) {}

  update(dtMs: number) {
    this.timer -= dtMs * this.speed;
    if (this.timer > 0) return;
    this.timer = 2500 + Math.random() * 3000;
    const idle = this.agents().filter((a) => !this.busy.has(a));
    if (!idle.length) return;
    this.run(idle[Math.floor(Math.random() * idle.length)]);
  }

  isBusy(agentId: string) { return this.busy.has(agentId); }

  /** Manually assign a task (from the UI). Ignored if the agent is already busy. */
  assign(agentId: string, title: string) {
    if (!this.busy.has(agentId)) this.run(agentId, title);
  }

  private wait(ms: number) {
    return new Promise<void>((res) => {
      let left = ms;
      const tick = () => { left -= 100 * this.speed; left <= 0 ? res() : setTimeout(tick, 100); };
      tick();
    });
  }

  private async run(agentId: string, title?: string) {
    this.busy.add(agentId);
    const taskId = `t${++this.n}`;
    this.emit({ type: 'task.assigned', agentId, taskId, title: title ?? TASKS[Math.floor(Math.random() * TASKS.length)] });
    await this.wait(4000); // walking to desk
    if (!this.agents().includes(agentId)) return void this.busy.delete(agentId);
    this.emit({ type: 'agent.state', agentId, state: 'thinking' });
    await this.wait(2000);
    let failed = false;
    for (let p = 0; p <= 100; p += 10) {
      if (!this.agents().includes(agentId)) return void this.busy.delete(agentId);
      if (p === 0) this.emit({ type: 'agent.state', agentId, state: 'working' });
      this.emit({ type: 'task.progress', agentId, progress: p / 100 });
      const roll = Math.random();
      if (roll < 0.03) { this.emit({ type: 'agent.state', agentId, state: 'waiting_input' }); await this.wait(4000);
        this.emit({ type: 'agent.state', agentId, state: 'working' }); }
      else if (roll < 0.06) { this.emit({ type: 'agent.state', agentId, state: 'blocked' }); failed = true; await this.wait(3000); break; }
      await this.wait(900);
    }
    this.emit({ type: 'task.done', agentId, taskId, ok: !failed });
    await this.wait(6000);
    this.busy.delete(agentId);
  }
}
