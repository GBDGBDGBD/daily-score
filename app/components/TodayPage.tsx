"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, formatFullDate, getLocalDateKey } from "@/app/lib/date";
import {
  getCrossedMilestone,
  getTriggeredMilestones,
  markTriggeredMilestones,
  milestonesAtOrBelow,
  type ProgressMilestone,
} from "@/app/lib/milestones";
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

interface ScoreFeedbackState {
  token: number;
  score: number;
}

interface MilestoneFeedbackState {
  token: number;
  level: ProgressMilestone;
}

type ScoreProgressStage = 0 | 30 | 60 | 90 | 100;

interface ScoreChangeFeedback {
  token: number;
  value: number;
}

const MILESTONE_COPY: Record<ProgressMilestone, string> = {
  30: "状态启动",
  60: "已经过半",
  90: "只差一点",
  100: "今日完成",
};

const PROGRESS_STAGE_COPY: Record<ScoreProgressStage, string> = {
  0: "从第一项开始",
  30: "节奏已经启动",
  60: "状态正在上升",
  90: "离满分只差一点",
  100: "今日目标完成",
};

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

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function giveHapticFeedback(pattern: number | number[]): void {
  if (
    typeof navigator === "undefined" ||
    prefersReducedMotion() ||
    !("vibrate" in navigator)
  ) {
    return;
  }
  navigator.vibrate(pattern);
}

export function getScoreFeedbackCopy(score: number): string {
  if (score <= 0) return "你再懒点呢😠";
  if (score <= 3) return "干了总比没干强😓";
  if (score <= 6) return "还可以吧🙄";
  if (score <= 9) return "不错哦😏";
  return "太棒了 🎉";
}

export function getScoreProgressStage(rate: number): ScoreProgressStage {
  if (rate >= 100) return 100;
  if (rate >= 90) return 90;
  if (rate >= 60) return 60;
  if (rate >= 30) return 30;
  return 0;
}

export function shouldCompactScoreCard(
  currentlyCompact: boolean,
  scrollY: number,
): boolean {
  return currentlyCompact ? scrollY > 40 : scrollY > 90;
}

export function getCompactDateLabel(dateKey: string): string {
  const [, month, day] = dateKey.split("-").map(Number);
  return `${month}月${day}日`;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reduced;
}

function useAnimatedScore(
  totalScore: number,
  scoreRate: number,
  reducedMotion: boolean,
): { totalScore: number; scoreRate: number } {
  const [displayed, setDisplayed] = useState({ totalScore, scoreRate });
  const displayedRef = useRef({ totalScore, scoreRate });

  useEffect(() => {
    const target = { totalScore, scoreRate };
    if (reducedMotion) {
      displayedRef.current = target;
      const frame = requestAnimationFrame(() => setDisplayed(target));
      return () => cancelAnimationFrame(frame);
    }

    const start = displayedRef.current;
    const startedAt = performance.now();
    let frame = 0;
    const animate = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / 480);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = {
        totalScore:
          start.totalScore + (target.totalScore - start.totalScore) * eased,
        scoreRate: start.scoreRate + (target.scoreRate - start.scoreRate) * eased,
      };
      displayedRef.current = next;
      setDisplayed(next);
      if (progress < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [reducedMotion, scoreRate, totalScore]);

  return reducedMotion ? { totalScore, scoreRate } : displayed;
}

function formatAnimatedScore(value: number, target: number): string {
  if (Number.isInteger(target)) return String(Math.round(value));
  const decimals = Number.isInteger(target * 10) ? 1 : 2;
  return value.toFixed(decimals).replace(/\.?0+$/, "");
}

function formatScoreChange(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return `${rounded > 0 ? "+" : ""}${rounded}`;
}

interface TotalScoreCardProps {
  dateKey: string;
  totalScore: number;
  maxTotalScore: number;
  scoreRate: number;
  scoredCount: number;
  totalCount: number;
  comparisonDelta: number;
  hasYesterday: boolean;
  isHistory: boolean;
  isCompact: boolean;
  scoreChangeToken: number;
  milestoneFeedback?: MilestoneFeedbackState;
}

function TotalScoreCard({
  dateKey,
  totalScore,
  maxTotalScore,
  scoreRate,
  scoredCount,
  totalCount,
  comparisonDelta,
  hasYesterday,
  isHistory,
  isCompact,
  scoreChangeToken,
  milestoneFeedback,
}: TotalScoreCardProps) {
  const reducedMotion = usePrefersReducedMotion();
  const displayed = useAnimatedScore(totalScore, scoreRate, reducedMotion);
  const stage = getScoreProgressStage(scoreRate);
  const cardRef = useRef<HTMLElement>(null);
  const pulseAnimation = useRef<Animation | undefined>(undefined);
  const previousScore = useRef(totalScore);
  const previousChangeToken = useRef(scoreChangeToken);
  const changeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const [scoreChange, setScoreChange] = useState<ScoreChangeFeedback>();

  useEffect(() => {
    if (previousChangeToken.current === scoreChangeToken) return;
    previousChangeToken.current = scoreChangeToken;
    const change = totalScore - previousScore.current;
    previousScore.current = totalScore;
    const feedback = { token: scoreChangeToken, value: change };
    setScoreChange(feedback);

    if (changeTimer.current) clearTimeout(changeTimer.current);
    changeTimer.current = setTimeout(() => setScoreChange(undefined), 760);

    if (!reducedMotion && cardRef.current) {
      pulseAnimation.current?.cancel();
      const peakScale = isCompact
        ? change >= 0 ? 1.008 : 1.004
        : change >= 0 ? 1.015 : 1.007;
      pulseAnimation.current = cardRef.current.animate(
        [
          { transform: "translateZ(0) scale(1)" },
          { transform: `translateZ(0) scale(${peakScale})`, offset: 0.48 },
          { transform: "translateZ(0) scale(1)" },
        ],
        {
          duration: 300,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        },
      );
    }
  }, [isCompact, reducedMotion, scoreChangeToken, totalScore]);

  useEffect(
    () => () => {
      if (changeTimer.current) clearTimeout(changeTimer.current);
      pulseAnimation.current?.cancel();
    },
    [],
  );

  return (
    <section
      ref={cardRef}
      className={[
        "score-hero",
        isCompact ? "is-compact" : "",
        isHistory ? "is-history-score" : "",
        `progress-stage-${stage}`,
        scoreChange ? "has-score-change" : "",
        milestoneFeedback ? `milestone-active milestone-${milestoneFeedback.level}` : "",
      ].join(" ")}
    >
      {scoreChange && scoreChange.value > 0 ? (
        <span
          className="score-change-glow"
          aria-hidden="true"
          key={`glow-${scoreChange.token}`}
        />
      ) : null}

      <div
        className="score-dial"
        style={
          {
            "--score-rate": `${Math.min(100, Math.max(0, displayed.scoreRate)) * 3.6}deg`,
          } as React.CSSProperties
        }
        aria-label={`得分率 ${Math.round(scoreRate)}%`}
      >
        {scoreChange && !reducedMotion ? (
          <i
            className={`score-ring-dot ${scoreChange.value < 0 ? "is-decrease" : ""}`}
            aria-hidden="true"
            key={`dot-${scoreChange.token}`}
          />
        ) : null}
        <div>
          <strong>{Math.round(displayed.scoreRate)}</strong>
          <span>%</span>
        </div>
      </div>

      <div className="score-hero-copy">
        <span className="score-full-label">
          {isHistory ? "当日总分" : "今日总分"}
        </span>
        <div className="score-total-line">
          <span className="score-compact-prefix">
            {isHistory ? getCompactDateLabel(dateKey) : "今日"}
          </span>
          <h2 aria-label={`总分 ${totalScore}，理论满分 ${maxTotalScore}`}>
            <span
              className={[
                "hero-score-number",
                scoreChange && !reducedMotion ? "score-number-bump" : "",
              ].join(" ")}
              key={scoreChange?.token ?? "stable-score"}
              aria-hidden="true"
            >
              {formatAnimatedScore(displayed.totalScore, totalScore)}
            </span>
            <small>
              <span className="score-max-label">理论满分 </span>/ {maxTotalScore}
            </small>
          </h2>
          {scoreChange && Math.abs(scoreChange.value) > 0.001 ? (
            <span
              className={`score-floating-delta ${scoreChange.value < 0 ? "is-decrease" : ""}`}
              role="status"
              key={`delta-${scoreChange.token}`}
            >
              {formatScoreChange(scoreChange.value)}
            </span>
          ) : null}
        </div>
        <p className="score-comparison">
          {hasYesterday ? (
            <>
              比前一天
              <strong className={comparisonDelta >= 0 ? "positive" : "negative"}>
                {comparisonDelta >= 0 ? " +" : " "}
                {Math.round(comparisonDelta)}%
              </strong>
            </>
          ) : (
            "完成第一项，就算开始"
          )}
        </p>
        <div className="score-stage-copy">
          <i aria-hidden="true" />
          {PROGRESS_STAGE_COPY[stage]}
        </div>
      </div>

      <div className="completion-count">
        <strong>{scoredCount}</strong>
        <span>/{totalCount} 项</span>
      </div>

      <div className="score-compact-metrics" aria-hidden={!isCompact}>
        <strong>{Math.round(displayed.scoreRate)}%</strong>
        {!isHistory ? <span>{scoredCount}/{totalCount}</span> : null}
      </div>

      {milestoneFeedback ? (
        <div
          className="milestone-feedback"
          role="status"
          key={milestoneFeedback.token}
        >
          <div className="milestone-particles" aria-hidden="true">
            {Array.from({ length: milestoneFeedback.level === 100 ? 8 : 5 }).map(
              (_, index) => <i key={index} />,
            )}
          </div>
          <span>{MILESTONE_COPY[milestoneFeedback.level]}</span>
        </div>
      ) : null}
    </section>
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
  const [isScoreCompact, setIsScoreCompact] = useState(false);
  const [scoreChangeToken, setScoreChangeToken] = useState(0);
  const [scoreFeedback, setScoreFeedback] = useState<
    Record<string, ScoreFeedbackState | undefined>
  >({});
  const [milestoneFeedback, setMilestoneFeedback] =
    useState<MilestoneFeedbackState>();
  const [loading, setLoading] = useState(true);
  const saveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const feedbackTimers = useRef(
    new Map<string, ReturnType<typeof setTimeout>>(),
  );
  const noteTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const milestoneTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const pendingSaves = useRef(0);
  const feedbackToken = useRef(0);
  const previousProgress = useRef(0);
  const triggeredMilestones = useRef<ProgressMilestone[]>([]);
  const milestonesReady = useRef(false);
  const compactState = useRef(false);

  useEffect(() => {
    let frame = 0;
    let initialized = false;
    compactState.current = false;

    const updateCompactState = () => {
      frame = 0;
      const next = shouldCompactScoreCard(
        compactState.current,
        Math.max(0, window.scrollY),
      );
      if (initialized && next === compactState.current) return;
      initialized = true;
      compactState.current = next;
      setIsScoreCompact(next);
    };
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(updateCompactState);
    };

    frame = requestAnimationFrame(updateCompactState);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [dateKey]);

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
    milestonesReady.current = false;
    void getDayBundle(dateKey).then((bundle) => {
      if (cancelled) return;
      setMilestoneFeedback(undefined);
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
      const initialProgress = bundle.record?.scoreRate ?? 0;
      previousProgress.current = initialProgress;
      const storedMilestones = getTriggeredMilestones(dateKey);
      triggeredMilestones.current = markTriggeredMilestones(dateKey, [
        ...storedMilestones,
        ...milestonesAtOrBelow(initialProgress),
      ]);
      milestonesReady.current = true;
      setLoading(false);
    });
    const timers = saveTimers.current;
    const scoreTimers = feedbackTimers.current;
    return () => {
      cancelled = true;
      timers.forEach((timer) => clearTimeout(timer));
      scoreTimers.forEach((timer) => clearTimeout(timer));
      if (noteTimer.current) clearTimeout(noteTimer.current);
      if (milestoneTimer.current) clearTimeout(milestoneTimer.current);
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

  useEffect(() => {
    if (!milestonesReady.current || isHistory) {
      previousProgress.current = summary.scoreRate;
      return;
    }
    const crossed = getCrossedMilestone(
      previousProgress.current,
      summary.scoreRate,
      triggeredMilestones.current,
    );
    previousProgress.current = summary.scoreRate;
    if (!crossed) return;

    triggeredMilestones.current = markTriggeredMilestones(dateKey, [
      ...triggeredMilestones.current,
      ...milestonesAtOrBelow(summary.scoreRate),
    ]);
    feedbackToken.current += 1;
    setMilestoneFeedback({
      level: crossed,
      token: feedbackToken.current,
    });
    if (crossed === 60) giveHapticFeedback(10);
    if (crossed === 90) giveHapticFeedback([10, 35, 10]);
    if (crossed === 100) giveHapticFeedback([12, 35, 18]);

    if (milestoneTimer.current) clearTimeout(milestoneTimer.current);
    milestoneTimer.current = setTimeout(
      () => setMilestoneFeedback(undefined),
      crossed === 100 ? 1_600 : crossed === 90 ? 900 : 720,
    );
  }, [dateKey, isHistory, summary.scoreRate]);

  function setTemporaryScoreFeedback(
    habitId: string,
    score: number,
  ) {
    feedbackToken.current += 1;
    const token = feedbackToken.current;
    setScoreFeedback((current) => ({
      ...current,
      [habitId]: { token, score },
    }));
    const existing = feedbackTimers.current.get(habitId);
    if (existing) clearTimeout(existing);
    feedbackTimers.current.set(
      habitId,
      setTimeout(() => {
        setScoreFeedback((current) => ({ ...current, [habitId]: undefined }));
        feedbackTimers.current.delete(habitId);
      }, 1_120),
    );
  }

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

  function scheduleScoreSave(
    habitId: string,
    score: number,
    note: string,
  ) {
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

  function updateScore(
    habit: Habit,
    score: number,
    source: "button" | "slider",
  ) {
    const safeScore = Math.min(habit.maxScore, Math.max(0, score));
    setDraftScores((current) => ({ ...current, [habit.id]: safeScore }));
    setScoreChangeToken((current) => current + 1);
    setTemporaryScoreFeedback(habit.id, safeScore);
    if (source === "button" && safeScore > 0) {
      giveHapticFeedback(safeScore === habit.maxScore ? [8, 28, 12] : 8);
    }
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

      <TotalScoreCard
        key={dateKey}
        dateKey={dateKey}
        totalScore={summary.totalScore}
        maxTotalScore={summary.maxTotalScore}
        scoreRate={summary.scoreRate}
        scoredCount={scoredCount}
        totalCount={visibleHabits.length}
        comparisonDelta={delta}
        hasYesterday={Boolean(yesterday)}
        isHistory={isHistory}
        isCompact={isScoreCompact}
        scoreChangeToken={scoreChangeToken}
        milestoneFeedback={milestoneFeedback}
      />

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
          const feedback = scoreFeedback[habit.id];
          const quickScores = settings.quickScores
            .map((value) => Math.min(value, habit.maxScore))
            .filter((value, scoreIndex, values) => values.indexOf(value) === scoreIndex);
          return (
            <article
              className={[
                "habit-card",
                score !== undefined ? "scored" : "unscored",
              ].join(" ")}
              key={habit.id}
              style={
                {
                  "--habit-color": habit.color,
                } as React.CSSProperties
              }
            >
              <span className="habit-color-rail" aria-hidden="true" />
              <div className="habit-main">
                <div className="habit-icon" aria-hidden="true">
                  {habit.icon || "✓"}
                </div>
                <div className="habit-copy">
                  <div className="habit-name-row">
                    <span className="habit-index">{String(index + 1).padStart(2, "0")}</span>
                    <h3>{habit.name}</h3>
                    <output aria-label={`${habit.name}当前评分`}>
                      <span className="score-number" key={`${habit.id}-${score ?? "none"}`}>
                        {score ?? "未评分"}
                      </span>
                      {score !== undefined ? <small> / {habit.maxScore}</small> : null}
                    </output>
                  </div>
                  <div className="habit-meta">
                    <p>{habit.description || "为今天的实际完成度打分"}</p>
                    <span className="habit-state">
                      {score !== undefined ? "✓ 已评分" : "待评分"}
                    </span>
                  </div>
                </div>
              </div>
              {feedback ? (
                <div
                  className="score-feedback-overlay"
                  role="status"
                  key={feedback.token}
                >
                  <strong>{getScoreFeedbackCopy(feedback.score)}</strong>
                </div>
              ) : null}
              <div className="quick-scores" aria-label={`${habit.name}快捷评分`}>
                {quickScores.map((quickScore) => (
                  <button
                    key={quickScore}
                    type="button"
                    className={score === quickScore ? "active" : ""}
                    onClick={() => updateScore(habit, quickScore, "button")}
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
                  onChange={(event) =>
                    updateScore(habit, Number(event.target.value), "slider")
                  }
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
