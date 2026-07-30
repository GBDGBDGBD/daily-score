import Dexie, { type Table } from "dexie";
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
  }
}

let database: DailyScoreDatabase | undefined;

export function getDatabase(): DailyScoreDatabase {
  database ??= new DailyScoreDatabase();
  return database;
}
