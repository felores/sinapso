import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { InboxReviewCard, ReviewState } from "./inbox-review.js";

export interface InboxReviewRecord {
  id: string;
  state: ReviewState;
  comment?: string;
  updatedAt: string;
  approvedAt?: string;
  resultPaths?: string[];
}

export function createInboxReviewState(
  file: string,
  now: () => Date = () => new Date(),
) {
  const load = (): InboxReviewRecord[] => {
    try {
      const parsed = JSON.parse(readFileSync(file, "utf8"));
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (value): value is InboxReviewRecord =>
          value &&
          typeof value.id === "string" &&
          ["pending", "dismissed", "approved"].includes(value.state),
      );
    } catch {
      return [];
    }
  };

  const save = (records: InboxReviewRecord[]) => {
    mkdirSync(dirname(file), { recursive: true });
    const pruned = [...records]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 500);
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(pruned));
    renameSync(tmp, file);
  };

  const put = (
    id: string,
    patch: { state?: "pending" | "dismissed"; comment?: string },
  ): InboxReviewRecord => {
    const records = load();
    const previous = records.find((record) => record.id === id);
    const record: InboxReviewRecord = {
      id,
      state: patch.state ?? previous?.state ?? "pending",
      comment: patch.comment ?? previous?.comment,
      updatedAt: now().toISOString(),
      approvedAt: previous?.approvedAt,
      resultPaths: previous?.resultPaths,
    };
    save([record, ...records.filter((item) => item.id !== id)]);
    return record;
  };

  const approve = (
    id: string,
    resultPaths: string[] = [],
  ): InboxReviewRecord => {
    const records = load();
    const previous = records.find((record) => record.id === id);
    const at = now().toISOString();
    const record: InboxReviewRecord = {
      id,
      state: "approved",
      comment: previous?.comment,
      updatedAt: at,
      approvedAt: at,
      resultPaths,
    };
    save([record, ...records.filter((item) => item.id !== id)]);
    return record;
  };

  const join = (cards: InboxReviewCard[]): InboxReviewCard[] => {
    const records = new Map(load().map((record) => [record.id, record]));
    return cards
      .map((card) => ({ ...card, ...records.get(card.id) }))
      .filter((card) => card.state !== "dismissed");
  };

  return { load, save, put, approve, join };
}
