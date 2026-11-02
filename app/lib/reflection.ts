import type { Habit, HabitGroup, DailyRecord } from "./types";

export const REFLECTION_VERSION = 1;
export const SCORE_LEVELS = [0, 3, 6, 10];
type Task = [string, string, string[]?];
const sections: { name: string; icon: string; color: string; tasks: Task[] }[] = [
  { name: "英语", icon: "🌐", color: "#4378C5", tasks: [
    ["多邻国5关", "🦉", ["0关", "2关", "4关", "5关"]],
    ["雅思口语20min", "🎙️", ["完全没练", "5min", "10min", "20min"]],
    ["雅思听力30min", "🎧", ["完全没练", "10min", "20min", "30min"]],
    ["雅思写作一篇", "✍️"], ["拆解一首英文歌", "🎵"], ["看英语TV", "📺"],
  ] },
  { name: "CS能力", icon: "💻", color: "#7B62B5", tasks: [
    ["GitHub每日提交", "⌘"],
    ["Agent架构15min", "🤖", ["完全没学", "5min", "10min", "15min"]],
    ["大模型算法15min", "🧠", ["完全没学", "5min", "10min", "15min"]],
  ] },
  { name: "增肌减肥", icon: "💪", color: "#BE6B36", tasks: [
    ["健身/力量训练", "🏋️"], ["不吃夜宵", "🌙"],
    ["吃几顿健康餐", "🥗", ["0顿", "1顿", "1.5顿", "2顿"]],
    ["有氧40min", "🏃", ["0min", "15min", "30min", "40min"]],
  ] },
  { name: "健康生活", icon: "🌿", color: "#348578", tasks: [
    ["非学习手机/电脑娱乐", "📵", ["大于2h", "1.5～2h", "1～1.5h", "小于1h"]],
    ["起床时间", "☀️", ["10:30后", "10:00～10:30", "9:30～10:00", "9:30前"]],
    ["睡眠评分", "💤", ["小于60", "60～85", "85～95", "95～100"]],
  ] },
  { name: "更优秀/护肤", icon: "✨", color: "#B36486", tasks: [
    ["洗面奶", "🫧"], ["水乳", "💧"], ["社交，每天1人", "💬"],
  ] },
  { name: "整理相册", icon: "🖼️", color: "#5681A1", tasks: [
    ["整理相册", "📸", ["无", "0～100张", "100～300张", "300张以上"]],
  ] },
  { name: "赚/存钱", icon: "💰", color: "#9C7D36", tasks: [
    ["自媒体拍摄", "🎬", ["1周一条", "5天一条", "3天一条", "2天一条"]],
    ["花销（每日）", "🧾", ["大于200元（记账）", "150～200元", "100～150元", "0～100元"]],
  ] },
];

export function createReflectionGroups(now = Date.now()): HabitGroup[] {
  return sections.map((section, index) => ({
    id: `reflection-group-${index + 1}`, name: section.name, icon: section.icon,
    color: section.color, sortOrder: index, archived: false, createdAt: now, updatedAt: now,
  }));
}

export function createReflectionHabits(now = Date.now()): Habit[] {
  let order = 0;
  return sections.flatMap((section, groupIndex) => section.tasks.map(([name, icon, labels], index) => ({
    id: `reflection-${groupIndex + 1}-${index + 1}`, name, icon,
    description: labels ? (name === "自媒体拍摄" ? "按近期发布频率评分" : "对照下方标准，选择今天的分数") : "标准暂未细化，按实际完成度自评",
    scoreLabels: labels ?? ["～", "～", "～", "～"], color: section.color,
    groupId: `reflection-group-${groupIndex + 1}`, sortOrderInGroup: index,
    sortOrder: order++, maxScore: 10, weight: 1, enabled: true, archived: false,
    createdAt: now, updatedAt: now,
  })));
}

/** A saved day keeps its original checklist when a new stage replaces it. */
export function habitsForDay(habits: Habit[], record?: DailyRecord, scoredIds: string[] = []): Habit[] {
  if (record?.habitIds) {
    const ids = new Set([...record.habitIds, ...scoredIds]);
    return habits.filter(habit => ids.has(habit.id));
  }
  const ids = new Set(scoredIds);
  return habits.filter(habit => (!habit.archived && habit.enabled) || ids.has(habit.id));
}
