"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, formatFullDate, getLocalDateKey } from "@/app/lib/date";
import { calculateScoreSummary } from "@/app/lib/scoring";
import {
  getDayBundle,
  saveDayNote,
  saveHabitScore,
} from "@/app/repositories/appRepository";
import type {
  AppSettings,
  DailyRecord,
  Habit,
  HabitScore,
} from "@/app/lib/types";

type SaveState = "idle" | "saving" | "saved" | "error";

interface TodayPageProps {
  dateKey: string;
  habits: Habit[];
  settings: AppSettings;
  records: DailyRecord[];
  isHistory?: boolean;
  onSaved: () => Promise<void>;
  onOpenBackup?: () => void;
  showBackupReminder?: boolean;
}

function ScoreDial({ rate }: { rate: number }) {
  return (
    <div
      className="score-dial"
      style={{ "--score-rate": `${Math.min(100, Math.max(0, rate)) * 3.6}deg` } as React.CSSProperties}
      aria-label={`得分率 ${Math.round(rate)}%`}
    >
      <div>
        <strong>{Math.round(rate)}</strong>
        <span>%</span>
      </div>
    </div>
  );
}

export function TodayPage({
  dateKey,
  habits,
  settings,
  records,
  isHistory = false,
  onSaved,
  onOpenBackup,
  showBackupReminder = false,
}: TodayPageProps) {
  const [record, setRecord] = useState<DailyRecord>();
  const [draftScores, setDraftScores] = useState<Record<string, number | undefined>>({});
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({});
  const [dayNote, setDayNote] = useState("");
  const [openNote, setOpenNote] = useState<string>();
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [loading, setLoading] = useState(true);
  const saveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const noteTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingSaves = useRef(0);

  const visibleHabits = useMemo(() => {
    const scoreIds = new Set(Object.keys(draftScores));
    return habits.filter(
      (habit) =>
        (!habit.archived && habit.enabled) ||
        (isHistory && scoreIds.has(habit.id)),
    );
  }, [draftScores, habits, isHistory]);

  useEffect(() => {
    let cancelled = false;
    void getDayBundle(dateKey).then((bundle) => {
      if (cancelled) return;
      const nextScores: Record<string, number> = {};
      const nextNotes: Record<string, string> = {};
      bundle.scores.forEach((score: HabitScore) => {
        nextScores[score.habitId] = score.score;
        nextNotes[score.habitId] = score.note ?? "";
      });
      setDraftScores(nextScores);
      setDraftNotes(nextNotes);
      setRecord(bundle.record);
      setDayNote(bundle.record?.note ?? "");
      setSaveState("idle");
      setLoading(false);
    });
    const timers = saveTimers.current;
    return () => {
      cancelled = true;
      timers.forEach((timer) => clearTimeout(timer));
      if (noteTimer.current) clearTimeout(noteTimer.current);
    };
  }, [dateKey]);

  const summary = useMemo(
    () =>
      calculateScoreSummary(
        visibleHabits.map((habit) => ({
          score: draftScores[habit.id] ?? 0,
          maxScore: habit.maxScore,
          weight: habit.weight,
        })),
        settings.scoringMode === "weighted",
      ),
    [draftScores, settings.scoringMode, visibleHabits],
  );

  const scoredCount = Object.values(draftScores).filter(
    (score) => score !== undefined,
  ).length;
  const yesterday = records.find((item) => item.dateKey === addDays(dateKey, -1));
  const delta = summary.scoreRate - (yesterday?.scoreRate ?? 0);

  function startSaving() {
    pendingSaves.current += 1;
    setSaveState("saving");
  }

  function finishSaving(success: boolean) {
    pendingSaves.current = Math.max(0, pendingSaves.current - 1);
    if (!success) {
      setSaveState("error");
    } else if (pendingSaves.current === 0) {
      setSaveState("saved");
    }
  }

  function scheduleScoreSave(habitId: string, score: number, note: string) {
    const existing = saveTimers.current.get(habitId);
    if (existing) clearTimeout(existing);
    setSaveState("saving");
    saveTimers.current.set(
      habitId,
      setTimeout(async () => {
        startSaving();
        try {
          const nextRecord = await saveHabitScore(
            dateKey,
            habitId,
            score,
            note,
            settings.scoringMode,
          );
          setRecord(nextRecord);
          finishSaving(true);
          await onSaved();
        } catch {
          finishSaving(false);
        }
      }, 300),
    );
  }

  function updateScore(habit: Habit, score: number) {
    const safeScore = Math.min(habit.maxScore, Math.max(0, score));
    setDraftScores((current) => ({ ...current, [habit.id]: safeScore }));
    scheduleScoreSave(habit.id, safeScore, draftNotes[habit.id] ?? "");
  }

  function updateHabitNote(habit: Habit, note: string) {
    setDraftNotes((current) => ({ ...current, [habit.id]: note }));
    const score = draftScores[habit.id];
    if (score !== undefined) scheduleScoreSave(habit.id, score, note);
  }

  function updateDayNote(note: string) {
    setDayNote(note);
    if (noteTimer.current) clearTimeout(noteTimer.current);
    setSaveState("saving");
    noteTimer.current = setTimeout(async () => {
      startSaving();
      try {
        const nextRecord = await saveDayNote(
          dateKey,
          note,
          settings.scoringMode,
        );
        setRecord(nextRecord);
        finishSaving(true);
        await onSaved();
      } catch {
        finishSaving(false);
      }
    }, 300);
  }

  if (loading) {
    return (
      <div className="page-loading" role="status">
        <span />
        正在读取本机记录…
      </div>
    );
  }

  return (
    <div className="page-stack today-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">{isHistory ? "历史补录" : "今天也在稳稳向前"}</p>
          <h1>{formatFullDate(dateKey)}</h1>
        </div>
        <div className={`save-state save-${saveState}`} aria-live="polite">
          <span />
          {saveState === "saving"
            ? "正在保存"
            : saveState === "error"
              ? "保存失败"
              : saveState === "saved"
                ? "已保存"
                : "本机保存"}
        </div>
      </header>

      {showBackupReminder ? (
        <section className="backup-reminder">
          <div className="reminder-icon">↥</div>
          <div>
            <strong>给努力留一份备份</strong>
            <p>超过 7 天未备份，建议保存到 iCloud Drive。</p>
          </div>
          <button type="button" onClick={onOpenBackup}>
            去备份
          </button>
        </section>
      ) : null}

      <section className="score-hero">
        <ScoreDial rate={summary.scoreRate} />
        <div className="score-hero-copy">
          <span>{isHistory ? "当日得分" : "今日得分"}</span>
          <h2>
            {summary.totalScore}
            <small> / {summary.maxTotalScore}</small>
          </h2>
          <p>
            {yesterday ? (
              <>
                比前一天
                <strong className={delta >= 0 ? "positive" : "negative"}>
                  {delta >= 0 ? " +" : " "}
                  {Math.round(delta)}%
                </strong>
              </>
            ) : (
              "完成第一项，就算开始"
            )}
          </p>
        </div>
        <div className="completion-count">
          <strong>{scoredCount}</strong>
          <span>/{visibleHabits.length} 项</span>
        </div>
      </section>

      <div className="section-heading">
        <div>
          <p className="eyebrow">逐项评分</p>
          <h2>{record?.status === "completed" ? "今天全部完成" : "如实记录就很好"}</h2>
        </div>
        <span>{settings.scoringMode === "weighted" ? "权重模式" : "普通模式"}</span>
      </div>

      <div className="habit-list">
        {visibleHabits.map((habit, index) => {
          const score = draftScores[habit.id];
          const quickScores = settings.quickScores
            .map((value) => Math.min(value, habit.maxScore))
            .filter((value, scoreIndex, values) => values.indexOf(value) === scoreIndex);
          return (
            <article className={`habit-card ${score !== undefined ? "scored" : ""}`} key={habit.id}>
              <div className="habit-main">
                <div className="habit-icon" aria-hidden="true">
                  {habit.icon || "✓"}
                </div>
                <div className="habit-copy">
                  <div className="habit-name-row">
                    <span className="habit-index">{String(index + 1).padStart(2, "0")}</span>
                    <h3>{habit.name}</h3>
                    <output aria-label={`${habit.name}当前评分`}>
                      {score ?? "—"}
                      <small>/{habit.maxScore}</small>
                    </output>
                  </div>
                  <p>{habit.description || "为今天的实际完成度打分"}</p>
                </div>
              </div>
              <div className="quick-scores" aria-label={`${habit.name}快捷评分`}>
                {quickScores.map((quickScore) => (
                  <button
                    key={quickScore}
                    type="button"
                    className={score === quickScore ? "active" : ""}
                    onClick={() => updateScore(habit, quickScore)}
                    aria-label={`${habit.name} ${quickScore} 分`}
                  >
                    {quickScore}
                  </button>
                ))}
              </div>
              <div className="slider-row">
                <input
                  type="range"
                  min="0"
                  max={habit.maxScore}
                  step="1"
                  value={score ?? 0}
                  aria-label={`${habit.name}评分滑块`}
                  style={
                    {
                      "--slider-rate": `${((score ?? 0) / habit.maxScore) * 100}%`,
                    } as React.CSSProperties
                  }
                  onChange={(event) => updateScore(habit, Number(event.target.value))}
                />
                <button
                  className="note-toggle"
                  type="button"
                  aria-expanded={openNote === habit.id}
                  onClick={() => setOpenNote(openNote === habit.id ? undefined : habit.id)}
                >
                  {draftNotes[habit.id] ? "已记" : "备注"}
                </button>
              </div>
              {openNote === habit.id ? (
                <textarea
                  className="habit-note"
                  value={draftNotes[habit.id] ?? ""}
                  maxLength={200}
                  placeholder="这一项今天发生了什么？"
                  aria-label={`${habit.name}备注`}
                  onChange={(event) => updateHabitNote(habit, event.target.value)}
                />
              ) : null}
            </article>
          );
        })}
      </div>

      <section className="day-note-card">
        <div>
          <p className="eyebrow">今日总结</p>
          <h2>留下一句给明天的自己</h2>
        </div>
        <textarea
          value={dayNote}
          maxLength={500}
          placeholder="今天做得好的事、需要调整的事…"
          aria-label="今日总结"
          onChange={(event) => updateDayNote(event.target.value)}
        />
        <div className="textarea-meta">
          <span>自动保存在当前设备</span>
          <span>{dayNote.length}/500</span>
        </div>
      </section>

      {dateKey !== getLocalDateKey() ? (
        <p className="history-edit-note">你正在补录历史日期，修改会立即保存。</p>
      ) : null}
    </div>
  );
}
