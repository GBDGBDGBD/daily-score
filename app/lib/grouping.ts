import { calculateScoreSummary } from "@/app/lib/scoring";
import type {
  Habit,
  HabitGroup,
  ScoreSummary,
} from "@/app/lib/types";

export interface HabitGroupSection {
  group: HabitGroup;
  habits: Habit[];
}

export interface GroupedHabits {
  sections: HabitGroupSection[];
  ungrouped: Habit[];
}

export interface HabitGroupSummary extends ScoreSummary {
  scoredCount: number;
  totalCount: number;
}

export function sortHabitsWithinGroup(habits: Habit[]): Habit[] {
  return [...habits].sort(
    (a, b) =>
      (a.sortOrderInGroup ?? a.sortOrder) -
        (b.sortOrderInGroup ?? b.sortOrder) ||
      a.sortOrder - b.sortOrder,
  );
}

export function groupHabits(
  habits: Habit[],
  groups: HabitGroup[],
): GroupedHabits {
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const members = new Map<string, Habit[]>();
  const ungrouped: Habit[] = [];

  habits.forEach((habit) => {
    const group = habit.groupId ? groupById.get(habit.groupId) : undefined;
    if (!group) {
      ungrouped.push(habit);
      return;
    }
    const items = members.get(group.id) ?? [];
    items.push(habit);
    members.set(group.id, items);
  });

  const sections = [...groups]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .flatMap((group) => {
      const items = members.get(group.id);
      return items?.length
        ? [{ group, habits: sortHabitsWithinGroup(items) }]
        : [];
    });

  return {
    sections,
    ungrouped: sortHabitsWithinGroup(ungrouped),
  };
}

export function calculateHabitGroupSummary(
  habits: Habit[],
  scores: Record<string, number | undefined>,
  weighted: boolean,
): HabitGroupSummary {
  const summary = calculateScoreSummary(
    habits.map((habit) => ({
      score: scores[habit.id] ?? 0,
      maxScore: habit.maxScore,
      weight: habit.weight,
    })),
    weighted,
  );
  return {
    ...summary,
    scoredCount: habits.filter((habit) => scores[habit.id] !== undefined).length,
    totalCount: habits.length,
  };
}

export function getIncompleteGroupIds(
  habits: Habit[],
  groups: HabitGroup[],
  scores: Record<string, number | undefined>,
): string[] {
  return groupHabits(habits, groups).sections
    .filter(({ habits: groupHabits }) =>
      groupHabits.some((habit) => scores[habit.id] === undefined),
    )
    .map(({ group }) => group.id);
}
