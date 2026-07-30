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

export type StoredHabitWithoutRequiredColor = Omit<Habit, "color"> & {
  color?: string;
};

export function isHabitColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

export function getLegacyHabitColorOverrides(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return {};
    const parsed = JSON.parse(stored) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] =>
        isHabitColor(entry[1]),
      ),
    );
  } catch {
    return {};
  }
}

export function getPaletteColor(index: number): string {
  return HABIT_COLORS[((index % HABIT_COLORS.length) + HABIT_COLORS.length) % HABIT_COLORS.length];
}

export function resolveHabitColor(
  habit: Pick<StoredHabitWithoutRequiredColor, "id" | "sortOrder" | "color">,
  legacyOverrides: Record<string, string> = {},
): string {
  if (isHabitColor(habit.color)) return habit.color;
  const legacyColor = legacyOverrides[habit.id];
  if (isHabitColor(legacyColor)) return legacyColor;
  return getPaletteColor(habit.sortOrder);
}

export function getSuggestedHabitColor(
  habits: ReadonlyArray<Pick<Habit, "color">>,
): string {
  const usedColors = new Set(habits.map((habit) => habit.color.toUpperCase()));
  return (
    HABIT_COLORS.find((color) => !usedColors.has(color.toUpperCase())) ??
    getPaletteColor(habits.length)
  );
}

export function clearHabitColorOverrides(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Clearing app data still succeeds when browser storage is unavailable.
  }
}
