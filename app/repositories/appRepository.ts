import { getDatabase } from "@/app/db/database";
import { calculateScoreSummary, getRecordStatus } from "@/app/lib/scoring";
import type {
  AppBackup,
  AppSettings,
  DailyRecord,
  DayBundle,
  Habit,
  HabitScore,
  ScoringMode,
} from "@/app/lib/types";

const DEFAULT_HABITS: Array<Pick<Habit, "name" | "description" | "icon">> = [
  { name: "按时起床", description: "在计划时间开始新的一天", icon: "☀️" },
  { name: "运动", description: "让身体活动起来", icon: "🏃" },
  { name: "阅读", description: "专注阅读与输入", icon: "📖" },
  { name: "专业学习", description: "推进专业能力", icon: "🎯" },
  { name: "英语学习", description: "保持语言接触", icon: "💬" },
  { name: "写代码", description: "完成有价值的代码工作", icon: "⌨️" },
  { name: "健康饮食", description: "选择有营养的食物", icon: "🥗" },
  { name: "控制零食", description: "减少计划外进食", icon: "🍎" },
  { name: "喝水", description: "补充足量水分", icon: "💧" },
  { name: "整理环境", description: "让空间保持清爽", icon: "🧹" },
  { name: "今日复盘", description: "回顾得失与下一步", icon: "✍️" },
  { name: "控制娱乐时间", description: "有意识地使用屏幕", icon: "⏳" },
  { name: "与家人联系", description: "保持真诚连接", icon: "🏠" },
  { name: "护肤", description: "完成日常护理", icon: "✨" },
  { name: "按时睡觉", description: "在计划时间结束一天", icon: "🌙" },
];

export function createDefaultHabits(now = Date.now()): Habit[] {
  return DEFAULT_HABITS.map((habit, index) => ({
    ...habit,
    id: `habit-${index + 1}`,
    maxScore: 10,
    weight: 1,
    sortOrder: index,
    enabled: true,
    archived: false,
    createdAt: now,
    updatedAt: now,
  }));
}

function createDefaultSettings(now = Date.now()): AppSettings {
  return {
    id: "app-settings",
    theme: "system",
    scoringMode: "normal",
    quickScores: [0, 3, 6, 8, 10],
    initialized: true,
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
  };
}

export async function initializeApp(): Promise<void> {
  const db = getDatabase();
  await db.transaction("rw", [db.habits, db.settings], async () => {
    const settings = await db.settings.get("app-settings");
    if (settings?.initialized) return;
    if ((await db.habits.count()) === 0) {
      await db.habits.bulkAdd(createDefaultHabits());
    }
    await db.settings.put(createDefaultSettings());
  });
}

export async function getSettings(): Promise<AppSettings> {
  const db = getDatabase();
  return (await db.settings.get("app-settings")) ?? createDefaultSettings();
}

export async function updateSettings(
  patch: Partial<Omit<AppSettings, "id" | "createdAt">>,
): Promise<AppSettings> {
  const db = getDatabase();
  const current = await getSettings();
  const next = { ...current, ...patch, id: "app-settings" as const, updatedAt: Date.now() };
  await db.settings.put(next);
  return next;
}

export async function listHabits(includeArchived = true): Promise<Habit[]> {
  const habits = await getDatabase().habits.toArray();
  return habits
    .filter((habit) => includeArchived || !habit.archived)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function getDayBundle(dateKey: string): Promise<DayBundle> {
  const db = getDatabase();
  const [record, scores] = await Promise.all([
    db.dailyRecords.get(dateKey),
    db.habitScores.where("dateKey").equals(dateKey).toArray(),
  ]);
  return { record, scores };
}

async function recalculateRecord(
  dateKey: string,
  scoringMode: ScoringMode,
): Promise<DailyRecord> {
  const db = getDatabase();
  const [habits, scores, existing] = await Promise.all([
    db.habits.toArray(),
    db.habitScores.where("dateKey").equals(dateKey).toArray(),
    db.dailyRecords.get(dateKey),
  ]);
  const activeHabits = habits.filter((habit) => habit.enabled && !habit.archived);
  const activeIds = new Set(activeHabits.map((habit) => habit.id));
  const scoreByHabit = new Map(scores.map((score) => [score.habitId, score]));
  const includedHabits = [
    ...activeHabits,
    ...habits.filter(
      (habit) => !activeIds.has(habit.id) && scoreByHabit.has(habit.id),
    ),
  ];
  const items = includedHabits.map((habit) => ({
    score: scoreByHabit.get(habit.id)?.score ?? 0,
    maxScore: habit.maxScore,
    weight: habit.weight,
  }));
  const summary = calculateScoreSummary(items, scoringMode === "weighted");
  const scoredCount = includedHabits.filter((habit) =>
    scoreByHabit.has(habit.id),
  ).length;
  const now = Date.now();
  const record: DailyRecord = {
    id: dateKey,
    dateKey,
    note: existing?.note ?? "",
    ...summary,
    status: getRecordStatus(scoredCount, includedHabits.length),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await db.dailyRecords.put(record);
  return record;
}

export async function saveHabitScore(
  dateKey: string,
  habitId: string,
  score: number,
  note: string,
  scoringMode: ScoringMode,
): Promise<DailyRecord> {
  const db = getDatabase();
  return db.transaction(
    "rw",
    [db.habits, db.habitScores, db.dailyRecords],
    async () => {
      const habit = await db.habits.get(habitId);
      if (!habit) throw new Error("评分项目不存在");
      if (score < 0 || score > habit.maxScore) {
        throw new Error(`评分必须在 0 到 ${habit.maxScore} 之间`);
      }
      const id = `${dateKey}:${habitId}`;
      const existing = await db.habitScores.get(id);
      const now = Date.now();
      const habitScore: HabitScore = {
        id,
        dateKey,
        habitId,
        score,
        note,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      await db.habitScores.put(habitScore);
      return recalculateRecord(dateKey, scoringMode);
    },
  );
}

export async function saveDayNote(
  dateKey: string,
  note: string,
  scoringMode: ScoringMode,
): Promise<DailyRecord> {
  const db = getDatabase();
  return db.transaction(
    "rw",
    [db.habits, db.habitScores, db.dailyRecords],
    async () => {
      const record = await recalculateRecord(dateKey, scoringMode);
      const next = { ...record, note, updatedAt: Date.now() };
      await db.dailyRecords.put(next);
      return next;
    },
  );
}

export async function getAllRecords(): Promise<DailyRecord[]> {
  return (await getDatabase().dailyRecords.toArray()).sort((a, b) =>
    a.dateKey.localeCompare(b.dateKey),
  );
}

export async function getAllScores(): Promise<HabitScore[]> {
  return getDatabase().habitScores.toArray();
}

export async function saveHabit(
  input: Partial<Habit> & Pick<Habit, "name">,
): Promise<Habit> {
  const db = getDatabase();
  const existing = input.id ? await db.habits.get(input.id) : undefined;
  const habits = await listHabits();
  const now = Date.now();
  const habit: Habit = {
    id: existing?.id ?? crypto.randomUUID(),
    name: input.name.trim(),
    description: input.description?.trim() ?? "",
    icon: input.icon?.trim() || "✓",
    maxScore: Number(input.maxScore ?? existing?.maxScore ?? 10),
    weight: Number(input.weight ?? existing?.weight ?? 1),
    sortOrder: existing?.sortOrder ?? habits.length,
    enabled: input.enabled ?? existing?.enabled ?? true,
    archived: input.archived ?? existing?.archived ?? false,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  if (!habit.name) throw new Error("项目名称不能为空");
  if (habit.maxScore <= 0 || habit.maxScore > 100) {
    throw new Error("项目满分必须在 1 到 100 之间");
  }
  if (habit.weight <= 0 || habit.weight > 100) {
    throw new Error("项目权重必须在 0 到 100 之间");
  }
  await db.habits.put(habit);
  return habit;
}

export async function archiveHabit(habitId: string): Promise<void> {
  const db = getDatabase();
  await db.habits.update(habitId, {
    archived: true,
    enabled: false,
    updatedAt: Date.now(),
  });
}

export async function moveHabit(
  habitId: string,
  direction: -1 | 1,
): Promise<void> {
  const db = getDatabase();
  const habits = await listHabits(false);
  const index = habits.findIndex((habit) => habit.id === habitId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= habits.length) return;
  const current = habits[index];
  const sibling = habits[target];
  await db.transaction("rw", db.habits, async () => {
    await db.habits.update(current.id, {
      sortOrder: sibling.sortOrder,
      updatedAt: Date.now(),
    });
    await db.habits.update(sibling.id, {
      sortOrder: current.sortOrder,
      updatedAt: Date.now(),
    });
  });
}

export async function exportAllData(): Promise<AppBackup> {
  const db = getDatabase();
  const [habits, dailyRecords, habitScores, settings] = await Promise.all([
    db.habits.toArray(),
    db.dailyRecords.toArray(),
    db.habitScores.toArray(),
    getSettings(),
  ]);
  return {
    format: "daily-score-backup",
    schemaVersion: 1,
    appVersion: "1.0.0",
    exportedAt: new Date().toISOString(),
    habits,
    dailyRecords,
    habitScores,
    settings,
  };
}

export async function restoreAllData(backup: AppBackup): Promise<void> {
  const db = getDatabase();
  await db.transaction(
    "rw",
    [db.habits, db.dailyRecords, db.habitScores, db.settings],
    async () => {
      await db.habitScores.clear();
      await db.dailyRecords.clear();
      await db.habits.clear();
      await db.settings.clear();
      await db.habits.bulkAdd(backup.habits);
      await db.dailyRecords.bulkAdd(backup.dailyRecords);
      await db.habitScores.bulkAdd(backup.habitScores);
      await db.settings.put({ ...backup.settings, updatedAt: Date.now() });
    },
  );
}

export async function clearAllData(): Promise<void> {
  const db = getDatabase();
  await db.transaction(
    "rw",
    [db.habits, db.dailyRecords, db.habitScores, db.settings],
    async () => {
      await Promise.all([
        db.habitScores.clear(),
        db.dailyRecords.clear(),
        db.habits.clear(),
        db.settings.clear(),
      ]);
    },
  );
  await initializeApp();
}
