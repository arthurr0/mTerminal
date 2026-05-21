import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { agentBridge, type AgentEvent } from "../../electron/main/agents/bridge-server";
import {
  registerStatusTracker,
  snapshotStatuses,
  clearTabStatus,
  isLive,
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

describe("status-tracker session_start mapping", () => {
  afterEach(() => {
    clearTabStatus(9201);
  });

  it("maps session_start to ready, not thinking", () => {
    emit({ tabId: 9201, event: "session_start" });
    expect(statusOf(9201)?.state).toBe("ready");
  });

  it("marks the session active on session_start", () => {
    emit({ tabId: 9201, event: "session_start" });
    expect(statusOf(9201)?.sessionActive).toBe(true);
  });
});

describe("status-tracker decay timers", () => {
  beforeAll(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    clearTabStatus(9301);
    vi.clearAllTimers();
  });

  it("decays ready to idle after the ready flash", () => {
    emit({ tabId: 9301, event: "session_start" });
    expect(statusOf(9301)?.state).toBe("ready");
    vi.advanceTimersByTime(1_200);
    expect(statusOf(9301)?.state).toBe("idle");
  });

  it("never gets stuck on thinking after session_start (/clear regression)", () => {
    emit({ tabId: 9301, event: "session_start" });
    vi.advanceTimersByTime(300_000);
    expect(statusOf(9301)?.state).toBe("idle");
  });

  it("keeps a long real turn on thinking before the 5-min backstop", () => {
    emit({ tabId: 9301, event: "thinking" });
    vi.advanceTimersByTime(299_000);
    expect(statusOf(9301)?.state).toBe("thinking");
  });

  it("fires the thinking backstop after 5 minutes", () => {
    emit({ tabId: 9301, event: "thinking" });
    vi.advanceTimersByTime(300_000);
    expect(statusOf(9301)?.state).toBe("idle");
  });

  it("refreshes the backstop on intervening tool events", () => {
    emit({ tabId: 9301, event: "thinking" });
    vi.advanceTimersByTime(250_000);
    emit({ tabId: 9301, event: "tool_use" });
    vi.advanceTimersByTime(250_000);
    expect(statusOf(9301)?.state).toBe("thinking");
    vi.advanceTimersByTime(60_000);
    expect(statusOf(9301)?.state).toBe("idle");
  });

  it("flashes done then decays to idle after 3 seconds", () => {
    emit({ tabId: 9301, event: "thinking" });
    emit({ tabId: 9301, event: "done", source: "hook" });
    expect(statusOf(9301)?.state).toBe("done");
    vi.advanceTimersByTime(3_000);
    expect(statusOf(9301)?.state).toBe("idle");
  });
});

describe("status-tracker isLive", () => {
  afterEach(() => {
    clearTabStatus(9501);
  });

  it("is false for an unknown tab", () => {
    expect(isLive(9501)).toBe(false);
  });

  it("is true once an agent event arrives and false after a watcher exit", () => {
    emit({ tabId: 9501, event: "session_start" });
    expect(isLive(9501)).toBe(true);
    emit({ tabId: 9501, event: "done", source: "watcher" });
    expect(isLive(9501)).toBe(false);
  });

  it("is false after clearTabStatus", () => {
    emit({ tabId: 9501, event: "thinking" });
    clearTabStatus(9501);
    expect(isLive(9501)).toBe(false);
  });
});

describe("status-tracker cleanup", () => {
  beforeAll(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    clearTabStatus(9401);
    vi.clearAllTimers();
  });

  it("removes the record on clearTabStatus", () => {
    emit({ tabId: 9401, event: "thinking" });
    clearTabStatus(9401);
    expect(statusOf(9401)).toBeUndefined();
  });

  it("cancels a pending decay timer on clearTabStatus", () => {
    emit({ tabId: 9401, event: "thinking" });
    clearTabStatus(9401);
    vi.advanceTimersByTime(300_000);
    expect(statusOf(9401)).toBeUndefined();
  });
});
