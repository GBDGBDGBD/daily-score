import "fake-indexeddb/auto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getDatabase } from "@/app/db/database";
import { validateBackup } from "@/app/lib/backup";
import { getLocalDateKey } from "@/app/lib/date";
import { calculateScoreSummary } from "@/app/lib/scoring";
import { calculateStreak, getTrend } from "@/app/lib/statistics";
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

describe("备份校验", () => {
  it("接受合法结构并拒绝重复评分", async () => {
    await getDatabase().delete();
    await getDatabase().open();
    await initializeApp();
    const [habit] = await listHabits();
    await saveHabitScore("2026-07-30", habit.id, 5, "", "normal");
    const backup = await exportAllData();
    expect(validateBackup(backup).format).toBe("daily-score-backup");
    backup.habitScores.push({ ...backup.habitScores[0], id: "another-id" });
    expect(() => validateBackup(backup)).toThrow("重复评分");
  });
});
