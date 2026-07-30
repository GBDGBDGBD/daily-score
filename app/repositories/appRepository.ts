import { getDatabase } from "@/app/db/database";
import {
  getPaletteColor,
  getSuggestedHabitColor,
  isHabitColor,
  resolveHabitColor,
} from "@/app/lib/habitColors";
import { calculateScoreSummary, getRecordStatus } from "@/app/lib/scoring";
import type {
  AppBackup,
  AppSettings,
  DailyRecord,
  DayBundle,
  Habit,
  HabitGroup,
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
    color: getPaletteColor(index),
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
    schemaVersion: 2,
    collapsedGroupIds: [],
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
  const settings = await db.settings.get("app-settings");
  return settings
    ? {
        ...settings,
        schemaVersion: Math.max(settings.schemaVersion ?? 1, 2),
        collapsedGroupIds: settings.collapsedGroupIds ?? [],
      }
    : createDefaultSettings();
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

export async function listHabitGroups(
  includeArchived = true,
): Promise<HabitGroup[]> {
  const groups = await getDatabase().habitGroups.toArray();
  return groups
    .filter((group) => includeArchived || !group.archived)
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
  const groupId =
    "groupId" in input
      ? input.groupId || undefined
      : existing?.groupId;
  const groupSiblings = habits.filter(
    (habit) => !habit.archived && habit.groupId === groupId,
  );
  const now = Date.now();
  const habit: Habit = {
    id: existing?.id ?? crypto.randomUUID(),
    name: input.name.trim(),
    description: input.description?.trim() ?? "",
    icon: input.icon?.trim() || "✓",
    color: isHabitColor(input.color)
      ? input.color
      : existing?.color ??
        getSuggestedHabitColor(habits.filter((item) => !item.archived)),
    groupId,
    sortOrderInGroup:
      input.sortOrderInGroup ??
      existing?.sortOrderInGroup ??
      groupSiblings.length,
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

export async function saveHabitGroup(
  input: Partial<HabitGroup> & Pick<HabitGroup, "name">,
): Promise<HabitGroup> {
  const db = getDatabase();
  const existing = input.id ? await db.habitGroups.get(input.id) : undefined;
  const groups = await listHabitGroups();
  const now = Date.now();
  const group: HabitGroup = {
    id: existing?.id ?? crypto.randomUUID(),
    name: input.name.trim(),
    icon: input.icon?.trim() || existing?.icon || "◫",
    color: isHabitColor(input.color)
      ? input.color
      : existing?.color ??
        getSuggestedHabitColor(
          groups.map((item) => ({
            ...item,
            maxScore: 10,
            weight: 1,
            enabled: true,
          })),
        ),
    sortOrder: existing?.sortOrder ?? groups.length,
    archived: input.archived ?? existing?.archived ?? false,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  if (!group.name) throw new Error("分组名称不能为空");
  await db.habitGroups.put(group);
  return group;
}

export async function archiveHabit(habitId: string): Promise<void> {
  const db = getDatabase();
  await db.habits.update(habitId, {
    archived: true,
    enabled: false,
    updatedAt: Date.now(),
  });
}

export type HabitGroupArchiveMode = "archive-habits" | "ungroup-habits";

export async function archiveHabitGroup(
  groupId: string,
  mode: HabitGroupArchiveMode,
): Promise<void> {
  const db = getDatabase();
  await db.transaction(
    "rw",
    [db.habitGroups, db.habits, db.settings],
    async () => {
      const group = await db.habitGroups.get(groupId);
      if (!group) throw new Error("分组不存在");
      const members = await db.habits.where("groupId").equals(groupId).toArray();
      const now = Date.now();

      if (mode === "archive-habits") {
        await Promise.all(
          members.map((habit) =>
            db.habits.update(habit.id, {
              archived: true,
              enabled: false,
              updatedAt: now,
            }),
          ),
        );
      } else {
        const ungrouped = (await db.habits.toArray())
          .filter((habit) => !habit.groupId && !habit.archived)
          .sort(
            (a, b) =>
              (a.sortOrderInGroup ?? a.sortOrder) -
              (b.sortOrderInGroup ?? b.sortOrder),
          );
        await Promise.all(
          members.map((habit, index) =>
            db.habits.update(habit.id, {
              groupId: undefined,
              sortOrderInGroup: ungrouped.length + index,
              updatedAt: now,
            }),
          ),
        );
      }

      await db.habitGroups.update(groupId, { archived: true, updatedAt: now });
      const settings = await db.settings.get("app-settings");
      if (settings?.collapsedGroupIds?.includes(groupId)) {
        await db.settings.update("app-settings", {
          collapsedGroupIds: settings.collapsedGroupIds.filter(
            (id) => id !== groupId,
          ),
          updatedAt: now,
        });
      }
    },
  );
}

export async function updateHabitColor(
  habitId: string,
  color: string,
): Promise<void> {
  if (!isHabitColor(color)) throw new Error("项目颜色无效");
  const updated = await getDatabase().habits.update(habitId, {
    color,
    updatedAt: Date.now(),
  });
  if (!updated) throw new Error("项目不存在");
}

function sameGroup(habit: Habit, groupId?: string): boolean {
  return (habit.groupId || undefined) === (groupId || undefined);
}

function sortGroupHabits(habits: Habit[]): Habit[] {
  return [...habits].sort(
    (a, b) =>
      (a.sortOrderInGroup ?? a.sortOrder) -
        (b.sortOrderInGroup ?? b.sortOrder) ||
      a.sortOrder - b.sortOrder,
  );
}

export async function moveHabitToGroup(
  habitId: string,
  groupId?: string,
  beforeHabitId?: string,
): Promise<void> {
  if (beforeHabitId === habitId) return;
  const db = getDatabase();
  await db.transaction("rw", [db.habits, db.habitGroups], async () => {
    const moving = await db.habits.get(habitId);
    if (!moving) throw new Error("项目不存在");
    if (groupId) {
      const group = await db.habitGroups.get(groupId);
      if (!group || group.archived) throw new Error("目标分组不可用");
    }

    const allHabits = await db.habits.toArray();
    const sourceGroupId = moving.groupId;
    const sourceHabits = sortGroupHabits(
      allHabits.filter(
        (habit) =>
          habit.id !== habitId &&
          !habit.archived &&
          sameGroup(habit, sourceGroupId),
      ),
    );
    const targetHabits =
      sourceGroupId === groupId
        ? sourceHabits
        : sortGroupHabits(
            allHabits.filter(
              (habit) =>
                habit.id !== habitId &&
                !habit.archived &&
                sameGroup(habit, groupId),
            ),
          );
    const targetIndex = beforeHabitId
      ? targetHabits.findIndex((habit) => habit.id === beforeHabitId)
      : -1;
    const insertAt = targetIndex >= 0 ? targetIndex : targetHabits.length;
    const reorderedTarget = [...targetHabits];
    reorderedTarget.splice(insertAt, 0, { ...moving, groupId });
    const now = Date.now();

    await Promise.all(
      reorderedTarget.map((habit, index) =>
        db.habits.update(habit.id, {
          groupId,
          sortOrderInGroup: index,
          updatedAt: now,
        }),
      ),
    );
    if (sourceGroupId !== groupId) {
      await Promise.all(
        sourceHabits.map((habit, index) =>
          db.habits.update(habit.id, {
            sortOrderInGroup: index,
            updatedAt: now,
          }),
        ),
      );
    }
  });
}

export async function moveHabitInGroup(
  habitId: string,
  direction: -1 | 1,
): Promise<void> {
  const db = getDatabase();
  const habit = await db.habits.get(habitId);
  if (!habit) return;
  const siblings = sortGroupHabits(
    (await db.habits.toArray()).filter(
      (item) => !item.archived && sameGroup(item, habit.groupId),
    ),
  );
  const index = siblings.findIndex((item) => item.id === habitId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= siblings.length) return;
  const next = [...siblings];
  [next[index], next[target]] = [next[target], next[index]];
  const now = Date.now();
  await db.transaction("rw", db.habits, async () => {
    await Promise.all(
      next.map((item, sortOrderInGroup) =>
        db.habits.update(item.id, { sortOrderInGroup, updatedAt: now }),
      ),
    );
  });
}

export async function moveHabitGroup(
  groupId: string,
  direction: -1 | 1,
): Promise<void> {
  const db = getDatabase();
  const groups = await listHabitGroups(false);
  const index = groups.findIndex((group) => group.id === groupId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= groups.length) return;
  const current = groups[index];
  const sibling = groups[target];
  const now = Date.now();
  await db.transaction("rw", db.habitGroups, async () => {
    await db.habitGroups.update(current.id, {
      sortOrder: sibling.sortOrder,
      updatedAt: now,
    });
    await db.habitGroups.update(sibling.id, {
      sortOrder: current.sortOrder,
      updatedAt: now,
    });
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
  const [habits, habitGroups, dailyRecords, habitScores, settings] =
    await Promise.all([
      db.habits.toArray(),
      db.habitGroups.toArray(),
      db.dailyRecords.toArray(),
      db.habitScores.toArray(),
      getSettings(),
    ]);
  return {
    format: "daily-score-backup",
    schemaVersion: 2,
    appVersion: "1.0.0",
    exportedAt: new Date().toISOString(),
    habits,
    habitGroups,
    dailyRecords,
    habitScores,
    settings,
  };
}

export async function restoreAllData(backup: AppBackup): Promise<void> {
  const db = getDatabase();
  const restoredHabits = backup.habits.map((habit) => ({
    ...habit,
    color: resolveHabitColor(habit),
  }));
  const restoredGroups = backup.habitGroups ?? [];
  await db.transaction(
    "rw",
    [db.habits, db.habitGroups, db.dailyRecords, db.habitScores, db.settings],
    async () => {
      await db.habitScores.clear();
      await db.dailyRecords.clear();
      await db.habits.clear();
      await db.habitGroups.clear();
      await db.settings.clear();
      await db.habits.bulkAdd(restoredHabits);
      await db.habitGroups.bulkAdd(restoredGroups);
      await db.dailyRecords.bulkAdd(backup.dailyRecords);
      await db.habitScores.bulkAdd(backup.habitScores);
      await db.settings.put({
        ...backup.settings,
        schemaVersion: 2,
        collapsedGroupIds: backup.settings.collapsedGroupIds ?? [],
        updatedAt: Date.now(),
      });
    },
  );
}

export async function clearAllData(): Promise<void> {
  const db = getDatabase();
  await db.transaction(
    "rw",
    [db.habits, db.habitGroups, db.dailyRecords, db.habitScores, db.settings],
    async () => {
      await Promise.all([
        db.habitScores.clear(),
        db.dailyRecords.clear(),
        db.habits.clear(),
        db.habitGroups.clear(),
        db.settings.clear(),
      ]);
    },
  );
  await initializeApp();
}
