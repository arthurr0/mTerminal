import type { AgentStatus } from "../hooks/useAgentStatus";

const MAX_LABEL = 40;

const TOOL_VERBS: Record<string, string> = {
  edit: "editing",
  write: "editing",
  multiedit: "editing",
  notebookedit: "editing",
  read: "reading",
  notebookread: "reading",
  bash: "running",
  grep: "searching",
  glob: "searching",
  search: "searching",
  webfetch: "browsing",
  websearch: "browsing",
  task: "delegating",
};

export function cleanTitle(title: string): string {
  const stripped = title
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .replace(/\s+/g, " ")
    .trim();
  if (stripped.length <= MAX_LABEL) return stripped;
  return stripped.slice(0, MAX_LABEL - 1).trimEnd() + "…";
}

export function agentActivityLabel(status: AgentStatus): string {
  if (status.state === "awaitingInput") return "waiting";
  if (status.state === "done") return "done";
  if (status.state === "ready") return "ready";
  if (status.state === "idle") return "idle";
  const tool = status.detail?.tool;
  if (!tool) return "thinking";
  return TOOL_VERBS[tool.toLowerCase()] ?? tool.toLowerCase();
}

export function agentTabDisplay(
  status: AgentStatus,
  base: { label: string; sub?: string },
  oscTitle?: string,
): { label: string; sub: string } | null {
  // Persist the label for the whole agent session — only drop it once the
  // agent process actually exits (sessionActive=false), not on the brief
  // post-turn `done`→`idle` decay.
  if (!status.sessionActive) return null;
  const title = oscTitle ? cleanTitle(oscTitle) : "";
  const label = title || base.label;
  const agent = status.agent ?? "agent";
  const sub = `${agent} · ${agentActivityLabel(status)}`;
  return { label, sub };
}
