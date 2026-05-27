import { WebglAddon } from "@xterm/addon-webgl";
import { CanvasAddon } from "@xterm/addon-canvas";
import type { Terminal, ITerminalAddon } from "@xterm/xterm";

export type RendererKind = "webgl" | "canvas" | "none";

export function attachRenderer(
  term: Pick<Terminal, "loadAddon">,
  makeWebgl: () => WebglAddon = () => new WebglAddon(),
  makeCanvas: () => ITerminalAddon = () => new CanvasAddon(),
): RendererKind {
  try {
    const webgl = makeWebgl();
    webgl.onContextLoss(() => {
      try {
        webgl.dispose();
      } catch {}
      try {
        term.loadAddon(makeCanvas());
      } catch {}
    });
    term.loadAddon(webgl);
    return "webgl";
  } catch {
    try {
      term.loadAddon(makeCanvas());
      return "canvas";
    } catch {
      return "none";
    }
  }
}
