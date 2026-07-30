import { addDays, getDateRange } from "@/app/lib/date";
import type { DailyRecord, Habit, HabitScore } from "@/app/lib/types";

export interface TrendPoint {
  dateKey: string;
  rate: number;
  status: DailyRecord["status"];
}

export interface HabitAverage {
  habitId: string;
  name: string;
  icon: string;
  averageRate: number;
  entries: number;
}

export function getTrend(
  records: DailyRecord[],
  endDateKey: string,
  days: number,
): TrendPoint[] {
  const byDate = new Map(records.map((record) => [record.dateKey, record]));
  return getDateRange(endDateKey, days).map((dateKey) => {
    const record = byDate.get(dateKey);
    return {
      dateKey,
      rate: record?.scoreRate ?? 0,
      status: record?.status ?? "empty",
    };
  });
}

export function averageRate(records: DailyRecord[], days?: number): number {
  const eligible = records
    .filter((record) => record.status !== "empty")
    .slice(days ? -days : 0);
  if (eligible.length === 0) return 0;
  return Math.round(
    eligible.reduce((sum, record) => sum + record.scoreRate, 0) /
      eligible.length,
  );
}

export function calculateStreak(
  records: DailyRecord[],
  todayKey: string,
): number {
  const completed = new Set(
    records
      .filter((record) => record.status === "completed")
      .map((record) => record.dateKey),
  );
  let cursor = completed.has(todayKey) ? todayKey : addDays(todayKey, -1);
  let streak = 0;

  while (completed.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function calculateHabitAverages(
  habits: Habit[],
  scores: HabitScore[],
): HabitAverage[] {
  const scoreGroups = new Map<string, HabitScore[]>();
  scores.forEach((score) => {
    const group = scoreGroups.get(score.habitId) ?? [];
    group.push(score);
    scoreGroups.set(score.habitId, group);
  });

  return habits
    .map((habit) => {
      const entries = scoreGroups.get(habit.id) ?? [];
      const averageRate =
        entries.length === 0
          ? 0
          : Math.round(
              (entries.reduce((sum, entry) => sum + entry.score, 0) /
                entries.length /
                habit.maxScore) *
                100,
            );
      return {
        habitId: habit.id,
        name: habit.name,
        icon: habit.icon ?? "·",
        averageRate,
        entries: entries.length,
      };
    })
    .filter((habit) => habit.entries > 0)
    .sort((a, b) => b.averageRate - a.averageRate);
}
