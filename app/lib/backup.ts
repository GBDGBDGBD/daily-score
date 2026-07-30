import { getBackupTimeKey, isDateKey } from "@/app/lib/date";
import { isHabitColor } from "@/app/lib/habitColors";
import type {
  AppBackup,
  AppSettings,
  Habit,
  HabitGroup,
} from "@/app/lib/types";

export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function validateBackup(value: unknown): AppBackup {
  if (!isObject(value)) throw new Error("备份文件内容无效");
  if (value.format !== "daily-score-backup") {
    throw new Error("这不是“每日评分”备份文件");
  }
  if (typeof value.schemaVersion !== "number" || value.schemaVersion > 2) {
    throw new Error("备份版本较新，请先升级应用");
  }
  if (
    !Array.isArray(value.habits) ||
    !Array.isArray(value.dailyRecords) ||
    !Array.isArray(value.habitScores) ||
    !isObject(value.settings)
  ) {
    throw new Error("备份文件缺少必要数据");
  }

  const rawGroups = value.habitGroups ?? [];
  if (!Array.isArray(rawGroups)) {
    throw new Error("备份中的分组数据无效");
  }
  const habitGroups = rawGroups as HabitGroup[];
  const groupIds = new Set<string>();
  habitGroups.forEach((group) => {
    if (
      !isObject(group) ||
      typeof group.id !== "string" ||
      !group.id ||
      typeof group.name !== "string" ||
      !group.name.trim() ||
      groupIds.has(group.id) ||
      !isHabitColor(group.color)
    ) {
      throw new Error("备份中的分组数据无效或重复");
    }
    groupIds.add(group.id);
  });

  const habits = value.habits as Habit[];
  const habitIds = new Set<string>();
  habits.forEach((habit) => {
    if (
      !isObject(habit) ||
      typeof habit.id !== "string" ||
      !habit.id ||
      typeof habit.name !== "string" ||
      habitIds.has(habit.id)
    ) {
      throw new Error("备份中的项目数据无效或重复");
    }
    if (
      typeof habit.maxScore !== "number" ||
      habit.maxScore <= 0 ||
      typeof habit.weight !== "number" ||
      habit.weight <= 0
    ) {
      throw new Error("备份中的项目满分或权重无效");
    }
    if ("color" in habit && habit.color !== undefined && !isHabitColor(habit.color)) {
      throw new Error("备份中的项目颜色无效");
    }
    if (
      habit.groupId !== undefined &&
      (typeof habit.groupId !== "string" || !groupIds.has(habit.groupId))
    ) {
      throw new Error("备份中的项目引用了不存在的分组");
    }
    habitIds.add(habit.id);
  });

  const scoreKeys = new Set<string>();
  (value.habitScores as Array<Record<string, unknown>>).forEach((score) => {
    if (
      !isObject(score) ||
      typeof score.id !== "string" ||
      !isDateKey(score.dateKey) ||
      typeof score.habitId !== "string" ||
      !habitIds.has(score.habitId) ||
      typeof score.score !== "number"
    ) {
      throw new Error("备份中的评分记录无效");
    }
    const habit = habits.find((item) => item.id === score.habitId);
    if (!habit || score.score < 0 || score.score > habit.maxScore) {
      throw new Error("备份中的评分超出合法范围");
    }
    const uniqueKey = `${score.dateKey}:${score.habitId}`;
    if (scoreKeys.has(uniqueKey)) throw new Error("备份中存在重复评分");
    scoreKeys.add(uniqueKey);
  });

  (value.dailyRecords as Array<Record<string, unknown>>).forEach((record) => {
    if (!isObject(record) || !isDateKey(record.dateKey)) {
      throw new Error("备份中的日期记录无效");
    }
  });

  const rawSettings = value.settings as unknown as AppSettings;
  if (
    rawSettings.collapsedGroupIds !== undefined &&
    (!Array.isArray(rawSettings.collapsedGroupIds) ||
      rawSettings.collapsedGroupIds.some(
        (id) => typeof id !== "string" || !groupIds.has(id),
      ))
  ) {
    throw new Error("备份中的分组折叠偏好无效");
  }

  return {
    ...(value as unknown as AppBackup),
    habitGroups,
    settings: {
      ...rawSettings,
      collapsedGroupIds: rawSettings.collapsedGroupIds ?? [],
    },
  };
}

export function backupToFile(
  backup: AppBackup,
  prefix = "daily-score-backup",
): File {
  const content = JSON.stringify(backup, null, 2);
  return new File([content], `${prefix}-${getBackupTimeKey()}.json`, {
    type: "application/json",
  });
}

export function downloadFile(file: File): void {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
