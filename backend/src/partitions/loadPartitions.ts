import { join } from "node:path";
import type { NormalizedScore, ScoreId } from "@classe-orchestre/shared";
import { normalizeScore } from "./normalizeScore";

const SCORE_FILES: Record<ScoreId, string> = {
  piano_only: "piano_only.json",
  orchestre: "orchestre.json"
};

export async function loadPartitions(): Promise<Record<ScoreId, NormalizedScore>> {
  const partitionsDir = join(import.meta.dir, "../../../partitions");
  const entries = await Promise.all(
    Object.entries(SCORE_FILES).map(async ([scoreId, filename]) => {
      const raw = await Bun.file(join(partitionsDir, filename)).json();
      const score = normalizeScore(scoreId as ScoreId, raw);
      const noteCount = score.parts.reduce((sum, part) => sum + part.notes.length, 0);

      console.info(
        `Loaded ${score.id}: ${score.parts.length} parts, ${noteCount} notes, duration ${score.durationMs}ms`
      );

      return [scoreId, score] as const;
    })
  );

  return Object.fromEntries(entries) as Record<ScoreId, NormalizedScore>;
}
