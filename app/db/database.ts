import Dexie, { type Table } from "dexie";
import {
  clearHabitColorOverrides,
  getLegacyHabitColorOverrides,
  resolveHabitColor,
  type StoredHabitWithoutRequiredColor,
} from "@/app/lib/habitColors";
import type {
  AppSettings,
  DailyRecord,
  Habit,
  HabitScore,
} from "@/app/lib/types";

export class DailyScoreDatabase extends Dexie {
  habits!: Table<Habit, string>;
  dailyRecords!: Table<DailyRecord, string>;
  habitScores!: Table<HabitScore, string>;
  settings!: Table<AppSettings, string>;

  constructor(name = "daily-score-db") {
    super(name);
    this.version(1).stores({
      habits: "id, enabled, archived, sortOrder, createdAt",
      dailyRecords: "id, &dateKey, updatedAt",
      habitScores: "id, dateKey, habitId, &[dateKey+habitId], updatedAt",
      settings: "id",
    });
    this.version(2)
      .stores({
        habits: "id, enabled, archived, sortOrder, createdAt",
        dailyRecords: "id, &dateKey, updatedAt",
        habitScores: "id, dateKey, habitId, &[dateKey+habitId], updatedAt",
        settings: "id",
      })
      .upgrade(async (transaction) => {
        const legacyOverrides = getLegacyHabitColorOverrides();
        await transaction
          .table<StoredHabitWithoutRequiredColor, string>("habits")
          .toCollection()
          .modify((habit) => {
            habit.color = resolveHabitColor(habit, legacyOverrides);
          });
        clearHabitColorOverrides();
      });
  }
}

let database: DailyScoreDatabase | undefined;

export function getDatabase(): DailyScoreDatabase {
  database ??= new DailyScoreDatabase();
  return database;
}
