import { describe, expect, it, vi } from "vitest";
import {
  createResearchDocument,
  createResearchDocumentController,
  createResearchDocumentConflictActions,
  type ResearchDocument,
  type ResearchDocumentTransport,
} from "./research-document";

function harness(overrides: Partial<ResearchDocumentTransport> = {}) {
  let content = "one";
  let title = "Draft";
  const setDocument = vi.fn((doc: ResearchDocument) => {
    content = doc.content;
    title = doc.title;
  });
  const transport: ResearchDocumentTransport = {
    create: vi.fn(async (nextTitle, nextContent) => ({
      id: "doc-1",
      title: nextTitle,
      content: nextContent,
      revision: "r1",
    })),
    read: vi.fn(async () => ({
      id: "doc-1",
      title: "Remote",
      content: "remote",
      revision: "r3",
    })),
    save: vi.fn(async () => ({ revision: "r2" })),
    ...overrides,
  };
  const states: string[] = [];
  const controller = createResearchDocumentController({
    document: { id: "doc-1", title, content, revision: "r1" },
    getContent: () => content,
    getTitle: () => title,
    setDocument,
    transport,
    onState: (state) => states.push(state),
    debounceMs: 60_000,
  });
  return {
    controller,
    transport,
    states,
    setContent(value: string) {
      content = value;
      controller.autosave.notifyChange();
    },
  };
}

describe("research document state", () => {
  it("creates without an id and persists edits with the current revision", async () => {
    const h = harness();
    await expect(
      createResearchDocument(h.transport, "New", ""),
    ).resolves.toMatchObject({ id: "doc-1", revision: "r1" });
    expect(h.transport.create).toHaveBeenCalledWith("New", "");
    h.setContent("two");
    await h.controller.autosave.flush();
    expect(h.transport.save).toHaveBeenCalledWith({
      id: "doc-1",
      title: "Draft",
      content: "two",
      revision: "r1",
    });
    expect(h.controller.document().revision).toBe("r2");
  });

  it("reloads authoritative content and revision", async () => {
    const h = harness();
    h.setContent("local");
    await h.controller.reload();
    expect(h.controller.document()).toEqual({
      id: "doc-1",
      title: "Remote",
      content: "remote",
      revision: "r3",
    });
    expect(h.states.at(-1)).toBe("clean");
  });

  it("preserves local edits on a stale conflict", async () => {
    const h = harness({
      save: vi.fn(async () => {
        throw { status: 409 };
      }),
    });
    h.setContent("local survives");
    await h.controller.autosave.flush();
    expect(h.controller.document().content).toBe("local survives");
    expect(h.controller.autosave.state()).toBe("conflict");
  });

  it("explicitly rebases a local overwrite onto the latest revision", async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce({ status: 409 })
      .mockResolvedValueOnce({ revision: "r4" });
    const h = harness({ save });
    h.setContent("local survives");
    await h.controller.autosave.flush();
    await h.controller.overwrite();
    expect(save).toHaveBeenLastCalledWith(
      expect.objectContaining({ content: "local survives", revision: "r3" }),
    );
    expect(h.controller.autosave.state()).toBe("clean");
  });

  it("remains editable and retries after a failed save", async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ revision: "r2" });
    const h = harness({ save });
    h.setContent("first");
    await h.controller.autosave.flush();
    expect(h.controller.autosave.state()).toBe("error");
    h.setContent("retry content");
    await h.controller.retry();
    expect(h.controller.autosave.state()).toBe("clean");
    expect(save).toHaveBeenLastCalledWith(
      expect.objectContaining({ content: "retry content", revision: "r1" }),
    );
  });

  it("flushes a debounced edit before closing the captured controller", async () => {
    const h = harness();
    h.setContent("pending at close");
    await h.controller.close();
    expect(h.transport.save).toHaveBeenCalledWith(
      expect.objectContaining({ content: "pending at close" }),
    );
    expect(h.controller.autosave.state()).toBe("clean");
  });

  it("waits for an in-flight save and persists the final edit before close", async () => {
    let releaseFirst: (() => void) | undefined;
    const first = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const save = vi
      .fn()
      .mockImplementationOnce(async () => {
        await first;
        return { revision: "r2" };
      })
      .mockResolvedValueOnce({ revision: "r3" });
    const h = harness({ save });
    h.setContent("first snapshot");
    const saving = h.controller.autosave.flush();
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    h.setContent("final snapshot");
    const closing = h.controller.close();
    releaseFirst?.();
    await Promise.all([saving, closing]);

    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(
      expect.objectContaining({ content: "final snapshot", revision: "r2" }),
    );
  });
  it.each([
    ["save error", new Error("offline"), "error"],
    ["conflict", { status: 409 }, "conflict"],
  ])(
    "keeps the controller alive when close hits a %s",
    async (_label, failure, state) => {
      const save = vi.fn().mockRejectedValue(failure);
      const h = harness({ save });
      h.setContent("retryable draft");

      await expect(h.controller.close()).resolves.toBe(false);
      expect(h.controller.autosave.state()).toBe(state);
      expect(h.controller.document().content).toBe("retryable draft");
    },
  );

  it("binds conflict actions to the document that raised them", async () => {
    const first = harness();
    const second = harness();
    const reload = vi.spyOn(first.controller, "reload");
    let active = first.controller;
    const actions = createResearchDocumentConflictActions(
      first.controller,
      "doc-1",
      (controller) => controller === active,
    );
    active = second.controller;

    actions.reload();
    actions.overwrite();
    expect(reload).not.toHaveBeenCalled();
    expect(first.transport.read).not.toHaveBeenCalled();
  });
});
