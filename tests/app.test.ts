import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DailyScoreDatabase, getDatabase } from "@/app/db/database";
import { validateBackup } from "@/app/lib/backup";
import { getLocalDateKey } from "@/app/lib/date";
import { HABIT_COLORS } from "@/app/lib/habitColors";
import { getCrossedMilestone } from "@/app/lib/milestones";
import { calculateScoreSummary } from "@/app/lib/scoring";
import { calculateStreak, getTrend } from "@/app/lib/statistics";
import { getScoreFeedbackCopy } from "@/app/components/TodayPage";
import {
  archiveHabit,
  createDefaultHabits,
  exportAllData,
  getAllRecords,
  getAllScores,
  getSettings,
  initializeApp,
  listHabits,
  restoreAllData,
  saveHabitScore,
  updateHabitColor,
} from "@/app/repositories/appRepository";

describe("计分与日期", () => {
  it("计算普通分数与得分率", () => {
    expect(
      calculateScoreSummary(
        [
          { score: 8, maxScore: 10, weight: 1 },
          { score: 6, maxScore: 10, weight: 2 },
        ],
        false,
      ),
    ).toEqual({ totalScore: 14, maxTotalScore: 20, scoreRate: 70 });
  });

  it("计算权重分数", () => {
    expect(
      calculateScoreSummary(
        [
          { score: 8, maxScore: 10, weight: 1 },
          { score: 6, maxScore: 10, weight: 2 },
        ],
        true,
      ),
    ).toEqual({ totalScore: 20, maxTotalScore: 30, scoreRate: 66.67 });
  });

  it("拒绝越界评分并正确生成本地日期", () => {
    expect(() =>
      calculateScoreSummary([{ score: 11, maxScore: 10, weight: 1 }], false),
    ).toThrow("评分必须");
    expect(getLocalDateKey(new Date(2026, 6, 30, 0, 10))).toBe("2026-07-30");
  });
});

describe("展示反馈", () => {
  it("15 个默认项目获得稳定且不重复的颜色", () => {
    const colors = createDefaultHabits().map((habit) => habit.color);
    expect(new Set(colors).size).toBe(15);
    expect(colors).toEqual([...HABIT_COLORS]);
  });

  it("按分数展示对应的卡片反馈文案", () => {
    expect([0, 1, 3, 4, 6, 7, 9, 10].map(getScoreFeedbackCopy)).toEqual([
      "你再懒点呢😠",
      "干了总比没干强😓",
      "干了总比没干强😓",
      "还可以吧🙄",
      "还可以吧🙄",
      "不错哦😏",
      "不错哦😏",
      "太棒了 🎉",
    ]);
  });

  it("一次跨越多个进度阈值时只返回最高且不重复触发", () => {
    expect(getCrossedMilestone(25, 65, [])).toBe(60);
    expect(getCrossedMilestone(55, 65, [30, 60])).toBeNull();
    expect(getCrossedMilestone(85, 100, [30, 60])).toBe(100);
  });
});

describe("统计", () => {
  const records = [
    {
      id: "2026-07-28",
      dateKey: "2026-07-28",
      totalScore: 80,
      maxTotalScore: 100,
      scoreRate: 80,
      status: "completed" as const,
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: "2026-07-29",
      dateKey: "2026-07-29",
      totalScore: 70,
      maxTotalScore: 100,
      scoreRate: 70,
      status: "completed" as const,
      createdAt: 1,
      updatedAt: 1,
    },
  ];

  it("计算连续打卡与 7 天趋势", () => {
    expect(calculateStreak(records, "2026-07-30")).toBe(2);
    const trend = getTrend(records, "2026-07-30", 7);
    expect(trend).toHaveLength(7);
    expect(trend.at(-2)?.rate).toBe(70);
    expect(trend.at(-1)?.rate).toBe(0);
  });
});

describe("IndexedDB Repository", () => {
  beforeEach(async () => {
    await getDatabase().delete();
    await getDatabase().open();
  });

  afterAll(async () => {
    await getDatabase().delete();
  });

  it("默认项目初始化幂等", async () => {
    await initializeApp();
    await initializeApp();
    expect(await listHabits()).toHaveLength(15);
    expect((await getSettings()).initialized).toBe(true);
    expect(createDefaultHabits()).toHaveLength(15);
  });

  it("颜色修改直接持久化到 IndexedDB", async () => {
    await initializeApp();
    const [habit] = await listHabits();
    await updateHabitColor(habit.id, "#123456");
    expect((await listHabits())[0].color).toBe("#123456");
  });

  it("同一天同一项目重复保存时只保留一条记录", async () => {
    await initializeApp();
    const [habit] = await listHabits();
    await saveHabitScore("2026-07-30", habit.id, 6, "", "normal");
    await saveHabitScore("2026-07-30", habit.id, 8, "完成不错", "normal");
    const scores = await getAllScores();
    expect(scores).toHaveLength(1);
    expect(scores[0]).toMatchObject({ score: 8, note: "完成不错" });
    expect((await getAllRecords())[0].status).toBe("partial");
  });

  it("项目归档后保留历史评分", async () => {
    await initializeApp();
    const [habit] = await listHabits();
    await saveHabitScore("2026-07-30", habit.id, 10, "", "normal");
    await archiveHabit(habit.id);
    expect(await getAllScores()).toHaveLength(1);
    expect((await listHabits()).find((item) => item.id === habit.id)?.archived).toBe(true);
  });

  it("恢复事务失败时保留原数据", async () => {
    await initializeApp();
    const [habit] = await listHabits();
    await saveHabitScore("2026-07-30", habit.id, 7, "", "normal");
    const backup = await exportAllData();
    backup.habitScores.push({
      ...backup.habitScores[0],
      id: "duplicate-id",
    });
    await expect(restoreAllData(backup)).rejects.toThrow();
    expect(await getAllScores()).toHaveLength(1);
  });
});

describe("IndexedDB 颜色迁移", () => {
  it("只为缺少颜色的旧项目补齐颜色，并保留已有颜色", async () => {
    const databaseName = `daily-score-color-migration-${crypto.randomUUID()}`;
    const legacyDatabase = new Dexie(databaseName);
    legacyDatabase.version(1).stores({
      habits: "id, enabled, archived, sortOrder, createdAt",
      dailyRecords: "id, &dateKey, updatedAt",
      habitScores: "id, dateKey, habitId, &[dateKey+habitId], updatedAt",
      settings: "id",
    });
    await legacyDatabase.open();
    const legacyHabits = createDefaultHabits().map((habit, index) => {
      const habitWithoutColor = { ...habit } as Partial<typeof habit>;
      delete habitWithoutColor.color;
      return index === 0
        ? { ...habitWithoutColor, color: "#123456" }
        : habitWithoutColor;
    });
    await legacyDatabase.table("habits").bulkAdd(legacyHabits);
    legacyDatabase.close();

    const migratedDatabase = new DailyScoreDatabase(databaseName);
    await migratedDatabase.open();
    const migratedHabits = await migratedDatabase.habits.orderBy("sortOrder").toArray();

    expect(migratedHabits[0].color).toBe("#123456");
    expect(migratedHabits.every((habit) => Boolean(habit.color))).toBe(true);
    expect(new Set(migratedHabits.map((habit) => habit.color)).size).toBe(15);

    await migratedDatabase.delete();
  });
});

describe("备份校验", () => {
  it("接受合法结构并拒绝重复评分", async () => {
    await getDatabase().delete();
    await getDatabase().open();
    await initializeApp();
    const [habit] = await listHabits();
    await saveHabitScore("2026-07-30", habit.id, 5, "", "normal");
    const backup = await exportAllData();
    expect(validateBackup(backup).format).toBe("daily-score-backup");
    backup.habits.forEach((habit) => {
      delete (habit as Partial<typeof habit>).color;
    });
    expect(validateBackup(backup).format).toBe("daily-score-backup");
    backup.habitScores.push({ ...backup.habitScores[0], id: "another-id" });
    expect(() => validateBackup(backup)).toThrow("重复评分");
  });
});
