import { describe, it, expect } from "vitest";
import {
  cleanTitle,
  agentActivityLabel,
  agentTabDisplay,
} from "../../src/lib/agentLabel";
import type { AgentStatus } from "../../src/hooks/useAgentStatus";

function status(p: Partial<AgentStatus>): AgentStatus {
  return {
    state: "thinking",
    agent: "claude",
    lastChangeMs: 0,
    sessionActive: true,
    ...p,
  };
}

describe("cleanTitle", () => {
  it("strips leading glyphs/emoji and collapses whitespace", () => {
    expect(cleanTitle("✶ Updating   auth flow")).toBe("Updating auth flow");
    expect(cleanTitle("● running tests")).toBe("running tests");
  });

  it("trims and keeps plain titles", () => {
    expect(cleanTitle("  fix the readme  ")).toBe("fix the readme");
  });

  it("truncates very long titles with an ellipsis", () => {
    const out = cleanTitle(
      "Refactoring the entire authentication and authorization subsystem now",
    );
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(40);
  });
});

describe("agentActivityLabel", () => {
  it("maps awaitingInput and done states", () => {
    expect(agentActivityLabel(status({ state: "awaitingInput" }))).toBe("waiting");
    expect(agentActivityLabel(status({ state: "done" }))).toBe("done");
    expect(agentActivityLabel(status({ state: "idle" }))).toBe("idle");
  });

  it("maps known tools to verbs while thinking", () => {
    expect(agentActivityLabel(status({ detail: { tool: "Edit" } }))).toBe("editing");
    expect(agentActivityLabel(status({ detail: { tool: "Read" } }))).toBe("reading");
    expect(agentActivityLabel(status({ detail: { tool: "Bash" } }))).toBe("running");
    expect(agentActivityLabel(status({ detail: { tool: "Grep" } }))).toBe("searching");
    expect(agentActivityLabel(status({ detail: { tool: "WebFetch" } }))).toBe("browsing");
    expect(agentActivityLabel(status({ detail: { tool: "Task" } }))).toBe("delegating");
  });

  it("lowercases unknown tools", () => {
    expect(agentActivityLabel(status({ detail: { tool: "CustomTool" } }))).toBe(
      "customtool",
    );
  });

  it("falls back to thinking with no tool", () => {
    expect(agentActivityLabel(status({}))).toBe("thinking");
  });
});

describe("agentTabDisplay", () => {
  it("returns null once the agent session has exited", () => {
    expect(
      agentTabDisplay(
        status({ state: "done", sessionActive: false }),
        { label: "~/proj" },
        "Updating auth flow",
      ),
    ).toBeNull();
  });

  it("keeps the overlay while the session is alive but idle between turns", () => {
    const out = agentTabDisplay(
      status({ state: "idle", sessionActive: true }),
      { label: "~/proj" },
      "Updating auth flow",
    );
    expect(out).toEqual({ label: "Updating auth flow", sub: "claude · idle" });
  });

  it("uses the cleaned OSC title as the label and agent · activity as sub", () => {
    const out = agentTabDisplay(
      status({ detail: { tool: "Edit" } }),
      { label: "~/proj" },
      "✶ Updating auth flow",
    );
    expect(out).toEqual({ label: "Updating auth flow", sub: "claude · editing" });
  });

  it("falls back to the base label when there is no OSC title", () => {
    const out = agentTabDisplay(status({ detail: { tool: "Bash" } }), {
      label: "~/proj",
    });
    expect(out).toEqual({ label: "~/proj", sub: "claude · running" });
  });

  it("labels the agent generically when unknown", () => {
    const out = agentTabDisplay(
      status({ agent: null, state: "awaitingInput" }),
      { label: "~/proj" },
      "",
    );
    expect(out).toEqual({ label: "~/proj", sub: "agent · waiting" });
  });
});
