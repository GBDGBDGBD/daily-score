"use client";

import { useMemo, type CSSProperties, type ReactNode } from "react";
import {
  calculateHabitGroupSummary,
  getIncompleteGroupIds,
  groupHabits,
} from "@/app/lib/grouping";
import type { Habit, HabitGroup } from "@/app/lib/types";

interface GroupedHabitListProps {
  habits: Habit[];
  groups: HabitGroup[];
  scores: Record<string, number | undefined>;
  weighted: boolean;
  collapsedGroupIds: string[];
  onCollapsedChange: (groupIds: string[]) => void;
  renderHabit: (habit: Habit, index: number) => ReactNode;
  showIncompleteShortcut?: boolean;
}

function formatScore(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace(/\.?0+$/, "");
}

export function GroupedHabitList({
  habits,
  groups,
  scores,
  weighted,
  collapsedGroupIds,
  onCollapsedChange,
  renderHabit,
  showIncompleteShortcut = false,
}: GroupedHabitListProps) {
  const grouped = useMemo(() => groupHabits(habits, groups), [groups, habits]);
  const collapsed = useMemo(
    () => new Set(collapsedGroupIds),
    [collapsedGroupIds],
  );
  const incompleteGroupIds = useMemo(
    () => getIncompleteGroupIds(habits, groups, scores),
    [groups, habits, scores],
  );
  const hasCollapsedIncomplete = incompleteGroupIds.some((id) =>
    collapsed.has(id),
  );
  let habitIndex = 0;

  function setCollapsed(groupId: string, nextCollapsed: boolean) {
    const next = new Set(collapsedGroupIds);
    if (nextCollapsed) next.add(groupId);
    else next.delete(groupId);
    onCollapsedChange([...next]);
  }

  return (
    <div className="grouped-habit-list">
      {showIncompleteShortcut && hasCollapsedIncomplete ? (
        <button
          className="expand-incomplete-groups"
          type="button"
          onClick={() =>
            onCollapsedChange(
              collapsedGroupIds.filter(
                (groupId) => !incompleteGroupIds.includes(groupId),
              ),
            )
          }
        >
          <span aria-hidden="true">↧</span>
          展开未完成分组
        </button>
      ) : null}

      {grouped.sections.map(({ group, habits: groupHabits }) => {
        const summary = calculateHabitGroupSummary(
          groupHabits,
          scores,
          weighted,
        );
        const isCollapsed = collapsed.has(group.id);
        return (
          <section
            className={`habit-group-card ${isCollapsed ? "is-collapsed" : "is-expanded"}`}
            key={group.id}
            style={{ "--group-color": group.color } as CSSProperties}
          >
            <button
              className="habit-group-header"
              type="button"
              aria-expanded={!isCollapsed}
              aria-controls={`habit-group-${group.id}`}
              onClick={() => setCollapsed(group.id, !isCollapsed)}
            >
              <span className="habit-group-icon" aria-hidden="true">
                {group.icon || "◫"}
              </span>
              <span className="habit-group-title">
                <strong>{group.name}</strong>
                <small>
                  当前得分 {formatScore(summary.totalScore)}/
                  {formatScore(summary.maxTotalScore)}
                </small>
              </span>
              <span className="habit-group-stats">
                <strong>
                  {summary.scoredCount}/{summary.totalCount}
                </strong>
                <small>{Math.round(summary.scoreRate)}%</small>
              </span>
              <span className="habit-group-chevron" aria-hidden="true">
                ⌄
              </span>
            </button>
            <div
              className="habit-group-content"
              id={`habit-group-${group.id}`}
              aria-hidden={isCollapsed}
            >
              <div className="habit-group-content-inner">
                <div className="habit-group-connector" aria-hidden="true" />
                <div className="habit-group-items">
                  {groupHabits.map((habit) =>
                    renderHabit(habit, habitIndex++),
                  )}
                </div>
              </div>
            </div>
          </section>
        );
      })}

      {grouped.ungrouped.length ? (
        <section className="ungrouped-habits">
          {grouped.sections.length ? (
            <div className="ungrouped-habits-heading">
              <span aria-hidden="true">•</span>
              未分组项目
            </div>
          ) : null}
          <div className="habit-list">
            {grouped.ungrouped.map((habit) =>
              renderHabit(habit, habitIndex++),
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
