import { describe, it, expect, vi } from "vitest";
import { attachRenderer } from "../../src/lib/xterm-renderer";

function makeTerm() {
  return { loadAddon: vi.fn() };
}

describe("attachRenderer", () => {
  it("uses webgl when the addon loads", () => {
    const term = makeTerm();
    const webgl = { onContextLoss: vi.fn(), dispose: vi.fn() };
    const kind = attachRenderer(
      term,
      () => webgl as never,
      () => ({}) as never,
    );
    expect(kind).toBe("webgl");
    expect(term.loadAddon).toHaveBeenCalledWith(webgl);
  });

  it("falls back to canvas when webgl construction throws", () => {
    const term = makeTerm();
    const canvas = {};
    const kind = attachRenderer(
      term,
      () => {
        throw new Error("no gpu");
      },
      () => canvas as never,
    );
    expect(kind).toBe("canvas");
    expect(term.loadAddon).toHaveBeenCalledWith(canvas);
  });

  it("returns none when both renderers throw (e.g. jsdom)", () => {
    const term = makeTerm();
    const kind = attachRenderer(
      term,
      () => {
        throw new Error("no gpu");
      },
      () => {
        throw new Error("no 2d");
      },
    );
    expect(kind).toBe("none");
  });

  it("swaps to canvas on webgl context loss", () => {
    const term = makeTerm();
    let lossCb: (() => void) | null = null;
    const webgl = {
      onContextLoss: (cb: () => void) => {
        lossCb = cb;
      },
      dispose: vi.fn(),
    };
    const canvas = {};
    attachRenderer(
      term,
      () => webgl as never,
      () => canvas as never,
    );
    expect(lossCb).not.toBeNull();
    lossCb!();
    expect(webgl.dispose).toHaveBeenCalled();
    expect(term.loadAddon).toHaveBeenCalledWith(canvas);
  });
});
