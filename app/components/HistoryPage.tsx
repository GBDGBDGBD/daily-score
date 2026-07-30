"use client";

import { useMemo, useState } from "react";
import {
  formatFullDate,
  formatMonth,
  getLocalDateKey,
  getMonthGrid,
  parseDateKey,
} from "@/app/lib/date";
import type { AppSettings, DailyRecord, Habit } from "@/app/lib/types";
import { TodayPage } from "@/app/components/TodayPage";

interface HistoryPageProps {
  habits: Habit[];
  records: DailyRecord[];
  settings: AppSettings;
  selectedDate: string;
  onSelectDate: (dateKey: string) => void;
  onSaved: () => Promise<void>;
}

export function HistoryPage({
  habits,
  records,
  settings,
  selectedDate,
  onSelectDate,
  onSaved,
}: HistoryPageProps) {
  const [editing, setEditing] = useState(false);
  const today = getLocalDateKey();
  const calendarCells = getMonthGrid(selectedDate);
  const recordByDate = useMemo(
    () => new Map(records.map((record) => [record.dateKey, record])),
    [records],
  );
  const selectedRecord = recordByDate.get(selectedDate);

  function changeMonth(amount: number) {
    const next = parseDateKey(selectedDate);
    next.setDate(1);
    next.setMonth(next.getMonth() + amount);
    const nextKey = getLocalDateKey(next);
    onSelectDate(nextKey > today ? today : nextKey);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="history-editor">
        <button className="text-button back-button" type="button" onClick={() => setEditing(false)}>
          ← 返回月历
        </button>
        <TodayPage
          dateKey={selectedDate}
          habits={habits}
          settings={settings}
          records={records}
          isHistory
          onSaved={onSaved}
        />
      </div>
    );
  }

  return (
    <div className="page-stack history-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">回看每一步</p>
          <h1>历史记录</h1>
        </div>
        <div className="record-count">
          <strong>{records.filter((record) => record.status !== "empty").length}</strong>
          <span>累计天数</span>
        </div>
      </header>

      <section className="calendar-card">
        <div className="calendar-toolbar">
          <button type="button" onClick={() => changeMonth(-1)} aria-label="上个月">
            ‹
          </button>
          <h2>{formatMonth(selectedDate)}</h2>
          <button
            type="button"
            onClick={() => changeMonth(1)}
            aria-label="下个月"
            disabled={selectedDate.slice(0, 7) >= today.slice(0, 7)}
          >
            ›
          </button>
        </div>
        <div className="weekday-row">
          {["一", "二", "三", "四", "五", "六", "日"].map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>
        <div className="calendar-grid">
          {calendarCells.map((dateKey, index) => {
            if (!dateKey) return <span className="empty-cell" key={`empty-${index}`} />;
            const record = recordByDate.get(dateKey);
            const isFuture = dateKey > today;
            const status = record?.status ?? "empty";
            return (
              <button
                type="button"
                key={dateKey}
                disabled={isFuture}
                className={[
                  `calendar-day status-${status}`,
                  dateKey === selectedDate ? "selected" : "",
                  dateKey === today ? "today" : "",
                ].join(" ")}
                onClick={() => {
                  onSelectDate(dateKey);
                  setEditing(false);
                }}
                aria-label={`${formatFullDate(dateKey)}，${
                  isFuture
                    ? "未来日期"
                    : status === "completed"
                      ? "已完成"
                      : status === "partial"
                        ? "部分填写"
                        : "未打卡"
                }`}
              >
                <span>{Number(dateKey.slice(-2))}</span>
                {record && status !== "empty" ? (
                  <small>{Math.round(record.scoreRate)}</small>
                ) : null}
              </button>
            );
          })}
        </div>
        <div className="calendar-legend">
          <span><i className="legend-complete" /> 已打卡</span>
          <span><i className="legend-partial" /> 部分填写</span>
          <span><i className="legend-empty" /> 未打卡</span>
        </div>
      </section>

      <section className="history-detail">
        <div className="section-heading">
          <div>
            <p className="eyebrow">选中日期</p>
            <h2>{formatFullDate(selectedDate)}</h2>
          </div>
          <span
            className={`status-pill status-${selectedRecord?.status ?? "empty"}`}
          >
            {selectedRecord?.status === "completed"
              ? "已完成"
              : selectedRecord?.status === "partial"
                ? "部分填写"
                : "未打卡"}
          </span>
        </div>
        <div className="history-score">
          <div>
            <strong>{Math.round(selectedRecord?.scoreRate ?? 0)}%</strong>
            <span>得分率</span>
          </div>
          <div>
            <strong>{selectedRecord?.totalScore ?? 0}</strong>
            <span>当日得分</span>
          </div>
          <div>
            <strong>{selectedRecord?.maxTotalScore ?? habits.filter((habit) => habit.enabled && !habit.archived).reduce((sum, habit) => sum + habit.maxScore, 0)}</strong>
            <span>当日满分</span>
          </div>
        </div>
        {selectedRecord?.note ? (
          <blockquote>{selectedRecord.note}</blockquote>
        ) : (
          <p className="empty-copy">这一天还没有总结。</p>
        )}
        <button
          className="button button-primary button-wide"
          type="button"
          onClick={() => setEditing(true)}
        >
          {selectedRecord ? "查看并修改评分" : "补录这一天"}
        </button>
      </section>
    </div>
  );
}
