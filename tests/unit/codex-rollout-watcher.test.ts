import { describe, it, expect, afterEach, vi } from "vitest";
import { agentBridge, type AgentEvent } from "../../electron/main/agents/bridge-server";
import {
  recordCodexSession,
  handleEntry,
} from "../../electron/main/agents/codex-rollout-watcher";

describe("codex-rollout-watcher abort routing", () => {
  afterEach(() => {
    agentBridge.removeAllListeners("event");
  });

  it("emits a done event for the mapped tab on a TurnAborted entry", () => {
    const spy = vi.fn();
    agentBridge.on("event", spy);
    recordCodexSession("s1", 7);
    handleEntry({ session_id: "s1", payload: { type: "TurnAborted" } });
    expect(spy).toHaveBeenCalledTimes(1);
    const evt = spy.mock.calls[0]![0] as AgentEvent;
    expect(evt.tabId).toBe(7);
    expect(evt.agent).toBe("codex");
    expect(evt.event).toBe("done");
  });

  it("purges the session mapping so a repeated abort does not re-route", () => {
    const spy = vi.fn();
    agentBridge.on("event", spy);
    recordCodexSession("s2", 11);
    handleEntry({ session_id: "s2", payload: { type: "TurnAborted" } });
    handleEntry({ session_id: "s2", payload: { type: "TurnAborted" } });
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
