"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatShortDate, getDateRange, getLocalDateKey } from "@/app/lib/date";
import {
  averageRate,
  calculateHabitAverages,
  calculateStreak,
  getTrend,
} from "@/app/lib/statistics";
import type { DailyRecord, Habit, HabitScore } from "@/app/lib/types";

interface StatisticsPageProps {
  habits: Habit[];
  records: DailyRecord[];
  scores: HabitScore[];
  range: 7 | 30;
  onRangeChange: (range: 7 | 30) => void;
}

export function StatisticsPage({
  habits,
  records,
  scores,
  range,
  onRangeChange,
}: StatisticsPageProps) {
  const today = getLocalDateKey();
  const trend = getTrend(records, today, range);
  const sevenDayKeys = new Set(getDateRange(today, 7));
  const thirtyDayKeys = new Set(getDateRange(today, 30));
  const sevenRecords = records.filter((record) => sevenDayKeys.has(record.dateKey));
  const thirtyRecords = records.filter((record) => thirtyDayKeys.has(record.dateKey));
  const habitAverages = useMemo(
    () => calculateHabitAverages(habits, scores),
    [habits, scores],
  );
  const todayRecord = records.find((record) => record.dateKey === today);
  const completedRecords = records.filter((record) => record.status !== "empty");
  const highest = completedRecords.length
    ? Math.round(Math.max(...completedRecords.map((record) => record.scoreRate)))
    : 0;
  const chartData = trend.map((point) => ({
    ...point,
    label: range === 7 ? formatShortDate(point.dateKey) : point.dateKey.slice(-2),
  }));
  const barData = habitAverages.slice(0, 8).map((habit) => ({
    name: habit.name.length > 5 ? `${habit.name.slice(0, 5)}…` : habit.name,
    rate: habit.averageRate,
  }));
  const lowHabits = [...habitAverages]
    .sort((a, b) => a.averageRate - b.averageRate)
    .slice(0, 4);

  return (
    <div className="page-stack statistics-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">看见长期变化</p>
          <h1>数据统计</h1>
        </div>
        <div className="range-switch" aria-label="趋势范围">
          <button
            type="button"
            className={range === 7 ? "active" : ""}
            onClick={() => onRangeChange(7)}
          >
            7 天
          </button>
          <button
            type="button"
            className={range === 30 ? "active" : ""}
            onClick={() => onRangeChange(30)}
          >
            30 天
          </button>
        </div>
      </header>

      <section className="metrics-grid">
        <article className="metric-card metric-featured">
          <span>今日得分率</span>
          <strong>{Math.round(todayRecord?.scoreRate ?? 0)}%</strong>
          <small>{todayRecord ? "已计入长期趋势" : "今天还未开始"}</small>
        </article>
        <article className="metric-card">
          <span>连续打卡</span>
          <strong>{calculateStreak(records, today)}<em> 天</em></strong>
          <small>完整填写才计入</small>
        </article>
        <article className="metric-card">
          <span>7 天平均</span>
          <strong>{averageRate(sevenRecords)}%</strong>
          <small>{sevenRecords.filter((record) => record.status !== "empty").length} 天有记录</small>
        </article>
        <article className="metric-card">
          <span>30 天平均</span>
          <strong>{averageRate(thirtyRecords)}%</strong>
          <small>历史最高 {highest}%</small>
        </article>
      </section>

      <section className="chart-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">得分率趋势</p>
            <h2>最近 {range} 天</h2>
          </div>
          <span>{completedRecords.length} 天累计打卡</span>
        </div>
        {completedRecords.length ? (
          <div className="trend-chart" aria-label={`最近 ${range} 天得分率折线图`}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 12, right: 6, left: -24, bottom: 0 }}>
                <defs>
                  <linearGradient id="score-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.34} />
                    <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 5" />
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "var(--muted)", fontSize: 11 }}
                  interval={range === 30 ? 4 : 0}
                />
                <YAxis
                  domain={[0, 100]}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "var(--muted)", fontSize: 11 }}
                  ticks={[0, 50, 100]}
                />
                <Tooltip
                  formatter={(value) => [`${value}%`, "得分率"]}
                  labelFormatter={(_, payload) =>
                    payload?.[0]?.payload?.dateKey
                      ? formatShortDate(payload[0].payload.dateKey)
                      : ""
                  }
                  contentStyle={{
                    borderRadius: 14,
                    border: "1px solid var(--line)",
                    background: "var(--surface)",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="rate"
                  stroke="var(--accent)"
                  strokeWidth={3}
                  fill="url(#score-fill)"
                  activeDot={{ r: 5, fill: "var(--accent)", strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="chart-empty">
            <span>↗</span>
            <strong>趋势会从第一次评分开始</strong>
            <p>完成今天的打卡后回来看一看。</p>
          </div>
        )}
      </section>

      <section className="chart-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">30 天热力</p>
            <h2>稳定比完美更重要</h2>
          </div>
        </div>
        <div className="heatmap" aria-label="最近 30 天得分热力图">
          {getTrend(records, today, 30).map((point) => (
            <div
              key={point.dateKey}
              title={`${point.dateKey}：${Math.round(point.rate)}%`}
              data-level={
                point.status === "empty"
                  ? 0
                  : point.rate >= 80
                    ? 4
                    : point.rate >= 60
                      ? 3
                      : point.rate >= 40
                        ? 2
                        : 1
              }
            >
              <span>{Number(point.dateKey.slice(-2))}</span>
            </div>
          ))}
        </div>
        <div className="heatmap-legend">
          <span>少</span>
          {[0, 1, 2, 3, 4].map((level) => <i key={level} data-level={level} />)}
          <span>多</span>
        </div>
      </section>

      <section className="chart-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">项目表现</p>
            <h2>平均完成度</h2>
          </div>
        </div>
        {barData.length ? (
          <div className="bar-chart" aria-label="各项目平均得分柱状图">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 10, right: 0, left: -24, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 5" />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "var(--muted)", fontSize: 10 }}
                />
                <YAxis
                  domain={[0, 100]}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "var(--muted)", fontSize: 10 }}
                  ticks={[0, 50, 100]}
                />
                <Tooltip formatter={(value) => [`${value}%`, "平均完成度"]} />
                <Bar dataKey="rate" fill="var(--accent)" radius={[8, 8, 2, 2]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="empty-copy">积累几天记录后，这里会展示项目对比。</p>
        )}
        {lowHabits.length ? (
          <div className="low-list">
            <h3>值得多关照</h3>
            {lowHabits.map((habit) => (
              <div key={habit.habitId}>
                <span>{habit.icon}</span>
                <strong>{habit.name}</strong>
                <div><i style={{ width: `${habit.averageRate}%` }} /></div>
                <em>{habit.averageRate}%</em>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
