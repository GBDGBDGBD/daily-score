import type { Habit } from "@/app/lib/types";

export const HABIT_COLORS = [
  "#F06F78",
  "#F29645",
  "#D5A928",
  "#68B98A",
  "#3FB19B",
  "#3DA7C3",
  "#557FD8",
  "#756EDC",
  "#9A65C5",
  "#C8649A",
  "#D87558",
  "#75A058",
  "#458F84",
  "#607F9F",
  "#927566",
] as const;

const STORAGE_KEY = "daily-score-habit-colors-v1";

function readOverrides(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return {};
    const parsed = JSON.parse(stored) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, string>;
  } catch {
    return {};
  }
}

function hashId(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function paletteColor(index: number): string {
  return HABIT_COLORS[((index % HABIT_COLORS.length) + HABIT_COLORS.length) % HABIT_COLORS.length];
}

export function getHabitColor(
  habit: Pick<Habit, "id" | "sortOrder">,
): string {
  const override = readOverrides()[habit.id];
  if (HABIT_COLORS.some((color) => color === override)) return override;

  const defaultMatch = /^habit-(\d+)$/.exec(habit.id);
  if (defaultMatch) return paletteColor(Number(defaultMatch[1]) - 1);
  return paletteColor(hashId(habit.id));
}

export function getSuggestedHabitColor(existingCount: number): string {
  return paletteColor(existingCount);
}

export function setHabitColor(habitId: string, color: string): void {
  if (
    typeof window === "undefined" ||
    !HABIT_COLORS.some((candidate) => candidate === color)
  ) {
    return;
  }
  try {
    const overrides = readOverrides();
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...overrides, [habitId]: color }),
    );
  } catch {
    // Color preferences are optional and safely fall back to stable ID colors.
  }
}

export function clearHabitColorOverrides(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Clearing app data still succeeds when browser storage is unavailable.
  }
}
