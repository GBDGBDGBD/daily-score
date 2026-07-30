import type {
  RecordStatus,
  ScoreItem,
  ScoreSummary,
} from "@/app/lib/types";

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function validateScoreItem(item: ScoreItem): void {
  if (!Number.isFinite(item.maxScore) || item.maxScore <= 0) {
    throw new Error("项目满分必须大于 0");
  }
  if (!Number.isFinite(item.weight) || item.weight <= 0) {
    throw new Error("项目权重必须大于 0");
  }
  if (
    !Number.isFinite(item.score) ||
    item.score < 0 ||
    item.score > item.maxScore
  ) {
    throw new Error("评分必须在 0 到项目满分之间");
  }
}

export function calculateScoreSummary(
  items: ScoreItem[],
  weighted: boolean,
): ScoreSummary {
  const result = items.reduce(
    (summary, item) => {
      validateScoreItem(item);
      const weight = weighted ? item.weight : 1;
      summary.totalScore += item.score * weight;
      summary.maxTotalScore += item.maxScore * weight;
      return summary;
    },
    { totalScore: 0, maxTotalScore: 0 },
  );

  return {
    totalScore: round(result.totalScore),
    maxTotalScore: round(result.maxTotalScore),
    scoreRate:
      result.maxTotalScore === 0
        ? 0
        : round((result.totalScore / result.maxTotalScore) * 100),
  };
}

export function getRecordStatus(
  scoredCount: number,
  habitCount: number,
): RecordStatus {
  if (scoredCount === 0) return "empty";
  if (habitCount > 0 && scoredCount >= habitCount) return "completed";
  return "partial";
}
