export type RecordStatus = "empty" | "partial" | "completed";
export type ThemeMode = "light" | "dark" | "system";
export type ScoringMode = "normal" | "weighted";

export interface Habit {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  color: string;
  maxScore: number;
  weight: number;
  sortOrder: number;
  enabled: boolean;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface DailyRecord {
  id: string;
  dateKey: string;
  note?: string;
  totalScore: number;
  maxTotalScore: number;
  scoreRate: number;
  status: RecordStatus;
  createdAt: number;
  updatedAt: number;
}

export interface HabitScore {
  id: string;
  dateKey: string;
  habitId: string;
  score: number;
  note?: string;
  createdAt: number;
  updatedAt: number;
}

export interface AppSettings {
  id: "app-settings";
  theme: ThemeMode;
  scoringMode: ScoringMode;
  quickScores: number[];
  initialized: boolean;
  schemaVersion: number;
  lastBackupAt?: number;
  lastBackupVersion?: number;
  createdAt: number;
  updatedAt: number;
}

export interface AppBackup {
  format: "daily-score-backup";
  schemaVersion: number;
  appVersion: string;
  exportedAt: string;
  habits: Habit[];
  dailyRecords: DailyRecord[];
  habitScores: HabitScore[];
  settings: AppSettings;
}

export interface DayBundle {
  record?: DailyRecord;
  scores: HabitScore[];
}

export interface ScoreItem {
  score: number;
  maxScore: number;
  weight: number;
}

export interface ScoreSummary {
  totalScore: number;
  maxTotalScore: number;
  scoreRate: number;
}

export interface StorageStatus {
  persisted: boolean;
  usage: number;
  quota: number;
}

export type AppTab = "today" | "history" | "statistics" | "settings";
