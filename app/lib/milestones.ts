export const PROGRESS_MILESTONES = [30, 60, 90, 100] as const;

export type ProgressMilestone = (typeof PROGRESS_MILESTONES)[number];

const STORAGE_PREFIX = "daily-score-milestones:";

export function getCrossedMilestone(
  previousProgress: number,
  currentProgress: number,
  triggeredMilestones: readonly number[],
): ProgressMilestone | null {
  const crossed = PROGRESS_MILESTONES.filter(
    (milestone) =>
      previousProgress < milestone &&
      currentProgress >= milestone &&
      !triggeredMilestones.includes(milestone),
  );
  return crossed.at(-1) ?? null;
}

export function milestonesAtOrBelow(progress: number): ProgressMilestone[] {
  return PROGRESS_MILESTONES.filter((milestone) => progress >= milestone);
}

export function getTriggeredMilestones(dateKey: string): ProgressMilestone[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(
      window.localStorage.getItem(`${STORAGE_PREFIX}${dateKey}`) ?? "[]",
    ) as unknown;
    if (!Array.isArray(value)) return [];
    return PROGRESS_MILESTONES.filter((milestone) => value.includes(milestone));
  } catch {
    return [];
  }
}

export function markTriggeredMilestones(
  dateKey: string,
  milestones: readonly number[],
): ProgressMilestone[] {
  const existing = new Set(getTriggeredMilestones(dateKey));
  const requested = new Set(milestones);
  const next = PROGRESS_MILESTONES.filter(
    (milestone) => requested.has(milestone) || existing.has(milestone),
  );
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(
        `${STORAGE_PREFIX}${dateKey}`,
        JSON.stringify(next),
      );
    } catch {
      // Milestones remain session-safe through the caller's in-memory state.
    }
  }
  return next;
}

export function clearMilestoneHistory(): void {
  if (typeof window === "undefined") return;
  try {
    const keys = Array.from(
      { length: window.localStorage.length },
      (_, index) => window.localStorage.key(index),
    ).filter((key): key is string => Boolean(key?.startsWith(STORAGE_PREFIX)));
    keys.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // Clearing core app data never depends on optional milestone storage.
  }
}
