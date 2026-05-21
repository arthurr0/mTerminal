import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { agentBridge, type AgentEvent } from "../../electron/main/agents/bridge-server";
import {
  registerStatusTracker,
  snapshotStatuses,
  clearTabStatus,
} from "../../electron/main/agents/status-tracker";

beforeAll(() => {
  registerStatusTracker(() => null);
});

function emit(
  evt: Partial<AgentEvent> & { tabId: number; event: AgentEvent["event"] },
): void {
  agentBridge.emit("event", {
    agent: "claude",
    ts: Date.now(),
    ...evt,
  } as AgentEvent);
}

function statusOf(tabId: number) {
  return snapshotStatuses().find(([id]) => id === tabId)?.[1];
}

describe("status-tracker session liveness", () => {
  afterEach(() => {
    clearTabStatus(9101);
    clearTabStatus(9102);
  });

  it("marks the session active once an agent event arrives", () => {
    emit({ tabId: 9101, event: "thinking" });
    expect(statusOf(9101)?.sessionActive).toBe(true);
  });

  it("keeps the session active on a hook-driven done (turn finished, agent alive)", () => {
    emit({ tabId: 9101, event: "thinking" });
    emit({ tabId: 9101, event: "done", source: "hook" });
    const s = statusOf(9101);
    expect(s?.state).toBe("done");
    expect(s?.sessionActive).toBe(true);
  });

  it("ends the session when the process watcher reports the agent gone", () => {
    emit({ tabId: 9102, event: "thinking" });
    expect(statusOf(9102)?.sessionActive).toBe(true);
    emit({ tabId: 9102, event: "done", source: "watcher" });
    expect(statusOf(9102)?.sessionActive).toBe(false);
  });

  it("ends the session on a shutdown done (session_end)", () => {
    emit({ tabId: 9102, event: "thinking" });
    emit({ tabId: 9102, event: "done", source: "shutdown" });
    expect(statusOf(9102)?.sessionActive).toBe(false);
  });
});
