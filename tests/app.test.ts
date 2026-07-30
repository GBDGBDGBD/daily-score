import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DailyScoreDatabase, getDatabase } from "@/app/db/database";
import { validateBackup } from "@/app/lib/backup";
import { getLocalDateKey } from "@/app/lib/date";
import { HABIT_COLORS } from "@/app/lib/habitColors";
import {
  calculateHabitGroupSummary,
  groupHabits,
} from "@/app/lib/grouping";
import { getCrossedMilestone } from "@/app/lib/milestones";
import { calculateScoreSummary } from "@/app/lib/scoring";
import { calculateStreak, getTrend } from "@/app/lib/statistics";
import {
  getCompactDateLabel,
  getScoreFeedbackCopy,
  getScoreProgressStage,
  shouldCompactScoreCard,
} from "@/app/components/TodayPage";
import {
  archiveHabit,
  archiveHabitGroup,
  createDefaultHabits,
  exportAllData,
  getAllRecords,
  getAllScores,
  getSettings,
  initializeApp,
  listHabitGroups,
  listHabits,
  moveHabitToGroup,
  restoreAllData,
  saveHabitGroup,
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

describe("项目分组汇总", () => {
  const groups = [
    {
      id: "english",
      name: "英语学习",
      icon: "💬",
      color: "#123456",
      sortOrder: 0,
      archived: false,
      createdAt: 1,
      updatedAt: 1,
    },
  ];
  const habits = createDefaultHabits().slice(0, 3).map((habit, index) => ({
    ...habit,
    groupId: index < 2 ? "english" : "missing-group",
    sortOrderInGroup: 2 - index,
    weight: index + 1,
  }));

  it("按组内顺序整理项目，失效分组关系安全回落到未分组", () => {
    const grouped = groupHabits(habits, groups);
    expect(grouped.sections).toHaveLength(1);
    expect(grouped.sections[0].habits.map((habit) => habit.id)).toEqual([
      habits[1].id,
      habits[0].id,
    ]);
    expect(grouped.ungrouped.map((habit) => habit.id)).toEqual([habits[2].id]);
  });

  it("分组汇总复用普通与加权计分规则", () => {
    const scores = { [habits[0].id]: 8, [habits[1].id]: 6 };
    expect(
      calculateHabitGroupSummary(habits.slice(0, 2), scores, false),
    ).toEqual({
      totalScore: 14,
      maxTotalScore: 20,
      scoreRate: 70,
      scoredCount: 2,
      totalCount: 2,
    });
    expect(
      calculateHabitGroupSummary(habits.slice(0, 2), scores, true),
    ).toEqual({
      totalScore: 20,
      maxTotalScore: 30,
      scoreRate: 66.67,
      scoredCount: 2,
      totalCount: 2,
    });
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

  it("总分卡按阶段切换颜色，并用双阈值避免滚动抖动", () => {
    expect([0, 29.99, 30, 59.99, 60, 89.99, 90, 99.99, 100].map(
      getScoreProgressStage,
    )).toEqual([0, 0, 30, 30, 60, 60, 90, 90, 100]);

    expect(shouldCompactScoreCard(false, 90)).toBe(false);
    expect(shouldCompactScoreCard(false, 91)).toBe(true);
    expect(shouldCompactScoreCard(true, 41)).toBe(true);
    expect(shouldCompactScoreCard(true, 40)).toBe(false);
    expect(getCompactDateLabel("2026-07-29")).toBe("7月29日");
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

  it("项目可以移动到分组并保持指定的组内顺序", async () => {
    await initializeApp();
    const group = await saveHabitGroup({
      name: "英语学习",
      icon: "💬",
      color: "#123456",
    });
    const habits = (await listHabits()).slice(0, 3);
    await moveHabitToGroup(habits[0].id, group.id);
    await moveHabitToGroup(habits[1].id, group.id);
    await moveHabitToGroup(habits[2].id, group.id, habits[1].id);
    const members = (await listHabits())
      .filter((habit) => habit.groupId === group.id)
      .sort(
        (a, b) =>
          (a.sortOrderInGroup ?? a.sortOrder) -
          (b.sortOrderInGroup ?? b.sortOrder),
      );
    expect(members.map((habit) => habit.id)).toEqual([
      habits[0].id,
      habits[2].id,
      habits[1].id,
    ]);
  });

  it("归档分组可将项目移出分组且不删除历史评分", async () => {
    await initializeApp();
    const group = await saveHabitGroup({
      name: "健康管理",
      color: "#234567",
    });
    const [habit] = await listHabits();
    await moveHabitToGroup(habit.id, group.id);
    await saveHabitScore("2026-07-30", habit.id, 9, "", "normal");
    await archiveHabitGroup(group.id, "ungroup-habits");

    expect((await listHabitGroups()).find((item) => item.id === group.id)?.archived)
      .toBe(true);
    expect((await listHabits()).find((item) => item.id === habit.id)?.groupId)
      .toBeUndefined();
    expect(await getAllScores()).toHaveLength(1);
  });

  it("归档分组及组内项目仍保留历史关系和评分", async () => {
    await initializeApp();
    const group = await saveHabitGroup({
      name: "专注计划",
      color: "#345678",
    });
    const [habit] = await listHabits();
    await moveHabitToGroup(habit.id, group.id);
    await saveHabitScore("2026-07-29", habit.id, 7, "", "normal");
    await archiveHabitGroup(group.id, "archive-habits");

    const archivedHabit = (await listHabits()).find(
      (item) => item.id === habit.id,
    );
    expect(archivedHabit).toMatchObject({
      groupId: group.id,
      archived: true,
      enabled: false,
    });
    expect(await getAllScores()).toHaveLength(1);
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

describe("IndexedDB 分组迁移", () => {
  it("从 v2 无损增加分组表，不改变项目颜色和历史评分", async () => {
    const databaseName = `daily-score-group-migration-${crypto.randomUUID()}`;
    const legacyDatabase = new Dexie(databaseName);
    legacyDatabase.version(2).stores({
      habits: "id, enabled, archived, sortOrder, createdAt",
      dailyRecords: "id, &dateKey, updatedAt",
      habitScores: "id, dateKey, habitId, &[dateKey+habitId], updatedAt",
      settings: "id",
    });
    await legacyDatabase.open();
    const [legacyHabit] = createDefaultHabits();
    await legacyDatabase.table("habits").add(legacyHabit);
    await legacyDatabase.table("habitScores").add({
      id: `2026-07-29:${legacyHabit.id}`,
      dateKey: "2026-07-29",
      habitId: legacyHabit.id,
      score: 8,
      createdAt: 1,
      updatedAt: 1,
    });
    await legacyDatabase.table("settings").put({
      id: "app-settings",
      theme: "system",
      scoringMode: "normal",
      quickScores: [0, 3, 6, 8, 10],
      initialized: true,
      schemaVersion: 1,
      createdAt: 1,
      updatedAt: 1,
    });
    legacyDatabase.close();

    const migratedDatabase = new DailyScoreDatabase(databaseName);
    await migratedDatabase.open();
    const migratedHabit = await migratedDatabase.habits.get(legacyHabit.id);
    const migratedSettings =
      await migratedDatabase.settings.get("app-settings");

    expect(migratedHabit).toMatchObject({
      color: legacyHabit.color,
      sortOrderInGroup: legacyHabit.sortOrder,
    });
    expect(migratedHabit?.groupId).toBeUndefined();
    expect(await migratedDatabase.habitGroups.count()).toBe(0);
    expect(await migratedDatabase.habitScores.count()).toBe(1);
    expect(migratedSettings?.collapsedGroupIds).toEqual([]);

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

  it("新版备份包含分组，旧版备份缺少分组时仍可安全导入", async () => {
    await getDatabase().delete();
    await getDatabase().open();
    await initializeApp();
    const group = await saveHabitGroup({
      name: "英语学习",
      color: "#456789",
    });
    const [habit] = await listHabits();
    await moveHabitToGroup(habit.id, group.id);
    const backup = await exportAllData();

    expect(backup.schemaVersion).toBe(2);
    expect(backup.habitGroups).toHaveLength(1);
    expect(validateBackup(backup).habitGroups[0].name).toBe("英语学习");
    await archiveHabitGroup(group.id, "ungroup-habits");
    await restoreAllData(backup);
    expect((await listHabitGroups(false))[0].name).toBe("英语学习");
    expect((await listHabits()).find((item) => item.id === habit.id)?.groupId)
      .toBe(group.id);

    const legacyBackup = structuredClone(backup) as Partial<typeof backup> & {
      settings: Partial<typeof backup.settings>;
    };
    legacyBackup.schemaVersion = 1;
    delete legacyBackup.habitGroups;
    legacyBackup.habits = legacyBackup.habits?.map((item) => {
      const next = { ...item };
      delete next.groupId;
      delete next.sortOrderInGroup;
      return next;
    });
    delete (
      legacyBackup.settings as unknown as { collapsedGroupIds?: string[] }
    ).collapsedGroupIds;
    expect(validateBackup(legacyBackup).habitGroups).toEqual([]);
  });
});
