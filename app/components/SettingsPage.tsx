"use client";

import { useMemo, useRef, useState } from "react";
import {
  backupToFile,
  downloadFile,
  MAX_BACKUP_BYTES,
  validateBackup,
} from "@/app/lib/backup";
import {
  clearHabitColorOverrides,
  getSuggestedHabitColor,
  HABIT_COLORS,
} from "@/app/lib/habitColors";
import { clearMilestoneHistory } from "@/app/lib/milestones";
import { groupHabits } from "@/app/lib/grouping";
import { formatBytes } from "@/app/lib/storage";
import type {
  AppBackup,
  AppSettings,
  Habit,
  HabitGroup,
  StorageStatus,
  ThemeMode,
} from "@/app/lib/types";
import {
  archiveHabit,
  archiveHabitGroup,
  clearAllData,
  exportAllData,
  moveHabitGroup,
  moveHabitInGroup,
  moveHabitToGroup,
  restoreAllData,
  saveHabit,
  saveHabitGroup,
  updateHabitColor,
  updateSettings,
  type HabitGroupArchiveMode,
} from "@/app/repositories/appRepository";
import { Modal } from "@/app/components/Modal";

interface SettingsPageProps {
  habits: Habit[];
  groups: HabitGroup[];
  settings: AppSettings;
  storageStatus: StorageStatus;
  onReload: () => Promise<void>;
  backupSignal?: number;
}

interface HabitDraft {
  id?: string;
  name: string;
  description: string;
  icon: string;
  maxScore: number;
  weight: number;
  enabled: boolean;
  color: string;
  groupId?: string;
}

interface HabitGroupDraft {
  id?: string;
  name: string;
  icon: string;
  color: string;
}

const EMPTY_HABIT: HabitDraft = {
  name: "",
  description: "",
  icon: "✓",
  maxScore: 10,
  weight: 1,
  enabled: true,
  color: HABIT_COLORS[0],
};

const EMPTY_GROUP: HabitGroupDraft = {
  name: "",
  icon: "◫",
  color: HABIT_COLORS[4],
};

function formatBackupDate(timestamp?: number): string {
  if (!timestamp) return "从未备份";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

export function SettingsPage({
  habits,
  groups,
  settings,
  storageStatus,
  onReload,
}: SettingsPageProps) {
  const [editingHabit, setEditingHabit] = useState<HabitDraft>();
  const [editingGroup, setEditingGroup] = useState<HabitGroupDraft>();
  const [confirmArchive, setConfirmArchive] = useState<Habit>();
  const [confirmGroupArchive, setConfirmGroupArchive] = useState<{
    group: HabitGroup;
    mode: HabitGroupArchiveMode;
  }>();
  const [confirmClear, setConfirmClear] = useState(false);
  const [backupConfirm, setBackupConfirm] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<AppBackup>();
  const [openProjectMenu, setOpenProjectMenu] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [dragHabitId, setDragHabitId] = useState<string>();
  const dragHabitRef = useRef<string | undefined>(undefined);
  const fileInput = useRef<HTMLInputElement>(null);
  const activeGroups = useMemo(
    () => groups.filter((group) => !group.archived),
    [groups],
  );
  const groupedHabits = useMemo(
    () =>
      groupHabits(
        habits.filter((habit) => !habit.archived),
        activeGroups,
      ),
    [activeGroups, habits],
  );
  const managementSections = useMemo(() => {
    const membersByGroup = new Map(
      groupedHabits.sections.map((section) => [
        section.group.id,
        section.habits,
      ]),
    );
    return activeGroups.map((group) => ({
      group,
      habits: membersByGroup.get(group.id) ?? [],
    }));
  }, [activeGroups, groupedHabits.sections]);

  async function patchSettings(patch: Partial<AppSettings>) {
    await updateSettings(patch);
    await onReload();
  }

  async function handleBackup() {
    setBusy(true);
    try {
      const backup = await exportAllData();
      const file = backupToFile(backup);
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: "每日评分数据备份",
          text: "请选择“存储到文件”，并保存到 iCloud Drive。",
          files: [file],
        });
      } else {
        downloadFile(file);
      }
      setBackupConfirm(true);
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        setNotice("备份未完成，请稍后重试。");
      }
    } finally {
      setBusy(false);
    }
  }

  async function confirmBackupSaved() {
    await updateSettings({
      lastBackupAt: Date.now(),
      lastBackupVersion: 2,
    });
    setBackupConfirm(false);
    setNotice("已记录本次 iCloud 备份时间。");
    await onReload();
  }

  async function readRestoreFile(file?: File) {
    if (!file) return;
    try {
      if (file.size > MAX_BACKUP_BYTES) {
        throw new Error("备份文件超过 5 MB，已拒绝导入");
      }
      const content = await file.text();
      const backup = validateBackup(JSON.parse(content));
      setPendingRestore(backup);
    } catch (error) {
      setNotice((error as Error).message || "无法读取备份文件");
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function confirmRestore() {
    if (!pendingRestore) return;
    setBusy(true);
    try {
      const current = await exportAllData();
      downloadFile(backupToFile(current, "daily-score-pre-restore"));
      await restoreAllData(pendingRestore);
      setPendingRestore(undefined);
      setNotice("数据已完整恢复，恢复前副本也已下载。");
      await onReload();
    } catch {
      setNotice("恢复失败，原有数据未被修改。");
    } finally {
      setBusy(false);
    }
  }

  async function submitHabit() {
    if (!editingHabit) return;
    setBusy(true);
    try {
      const existing = editingHabit.id
        ? habits.find((habit) => habit.id === editingHabit.id)
        : undefined;
      const saved = await saveHabit(
        existing
          ? { ...editingHabit, groupId: existing.groupId }
          : editingHabit,
      );
      if (
        existing &&
        (existing.groupId || undefined) !==
          (editingHabit.groupId || undefined)
      ) {
        await moveHabitToGroup(saved.id, editingHabit.groupId);
      }
      setEditingHabit(undefined);
      await onReload();
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submitGroup() {
    if (!editingGroup) return;
    setBusy(true);
    try {
      await saveHabitGroup(editingGroup);
      setEditingGroup(undefined);
      await onReload();
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function chooseHabitColor(color: string) {
    const habitId = editingHabit?.id;
    setEditingHabit((current) => current ? { ...current, color } : current);
    if (!habitId) return;
    try {
      await updateHabitColor(habitId, color);
      await onReload();
    } catch (error) {
      setNotice((error as Error).message);
    }
  }

  async function duplicateHabit(habit: Habit) {
    setBusy(true);
    try {
      await saveHabit({
        name: `${habit.name} 副本`,
        description: habit.description ?? "",
        icon: habit.icon ?? "✓",
        maxScore: habit.maxScore,
        weight: habit.weight,
        enabled: habit.enabled,
        color: getSuggestedHabitColor(
          habits.filter((item) => !item.archived),
        ),
        groupId: habit.groupId,
      });
      setOpenProjectMenu(undefined);
      setNotice(`已复制“${habit.name}”。`);
      await onReload();
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function openHabitEditor(habit: Habit) {
    setEditingHabit({
      id: habit.id,
      name: habit.name,
      description: habit.description ?? "",
      icon: habit.icon ?? "✓",
      maxScore: habit.maxScore,
      weight: habit.weight,
      enabled: habit.enabled,
      color: habit.color,
      groupId: habit.groupId,
    });
  }

  function toggleManagedGroup(groupId: string) {
    const next = new Set(settings.collapsedGroupIds ?? []);
    if (next.has(groupId)) next.delete(groupId);
    else next.add(groupId);
    void patchSettings({ collapsedGroupIds: [...next] });
  }

  async function dropHabit(
    targetGroupId?: string,
    beforeHabitId?: string,
    movingHabitId = dragHabitRef.current ?? dragHabitId,
  ) {
    if (!movingHabitId) return;
    setBusy(true);
    try {
      await moveHabitToGroup(movingHabitId, targetGroupId, beforeHabitId);
      await onReload();
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      dragHabitRef.current = undefined;
      setDragHabitId(undefined);
      setBusy(false);
    }
  }

  function finishPointerDrag(event: React.PointerEvent<HTMLElement>) {
    const movingHabitId = dragHabitRef.current;
    if (!movingHabitId || event.pointerType === "mouse") return;
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-habit-drop], [data-group-drop]");
    const beforeHabitId = target?.dataset.habitDrop || undefined;
    const targetGroupId = target?.dataset.groupId || undefined;
    void dropHabit(targetGroupId, beforeHabitId, movingHabitId);
  }

  function renderManagedHabit(
    habit: Habit,
    index: number,
    siblings: Habit[],
  ) {
    return (
      <article
        key={habit.id}
        className={[
          "management-habit-row",
          !habit.enabled ? "disabled" : "",
          openProjectMenu === habit.id ? "menu-open" : "",
          dragHabitId === habit.id ? "is-dragging" : "",
        ].join(" ")}
        style={{ "--habit-color": habit.color } as React.CSSProperties}
        data-habit-drop={habit.id}
        data-group-id={habit.groupId ?? ""}
        draggable
        onDragStart={(event) => {
          dragHabitRef.current = habit.id;
          setDragHabitId(habit.id);
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", habit.id);
        }}
        onDragEnd={() => {
          dragHabitRef.current = undefined;
          setDragHabitId(undefined);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void dropHabit(habit.groupId, habit.id);
        }}
      >
        <span className="project-color-rail" aria-hidden="true" />
        <span
          className="management-drag-handle"
          aria-label={`拖动${habit.name}`}
          role="button"
          tabIndex={0}
          onPointerDown={(event) => {
            if (event.pointerType === "mouse") return;
            dragHabitRef.current = habit.id;
            setDragHabitId(habit.id);
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerUp={finishPointerDrag}
          onPointerCancel={() => {
            dragHabitRef.current = undefined;
            setDragHabitId(undefined);
          }}
          onKeyDown={(event) => {
            if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
            event.preventDefault();
            void moveHabitInGroup(
              habit.id,
              event.key === "ArrowUp" ? -1 : 1,
            ).then(onReload);
          }}
        >
          ⠿
        </span>
        <div className="project-icon">{habit.icon || "✓"}</div>
        <div className="project-copy">
          <strong>{habit.name}</strong>
          <span>
            满分 {habit.maxScore}
            {settings.scoringMode === "weighted"
              ? ` · 权重 ${habit.weight}`
              : ""}
          </span>
        </div>
        <label className="management-group-select">
          <span className="visually-hidden">移动{habit.name}到分组</span>
          <select
            value={habit.groupId ?? ""}
            aria-label={`移动${habit.name}到分组`}
            onChange={async (event) => {
              await moveHabitToGroup(
                habit.id,
                event.target.value || undefined,
              );
              await onReload();
            }}
          >
            <option value="">未分组</option>
            {activeGroups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </label>
        <div className="project-order">
          <button
            type="button"
            aria-label={`${habit.name}上移`}
            disabled={index === 0}
            onClick={async () => {
              await moveHabitInGroup(habit.id, -1);
              await onReload();
            }}
          >
            ↑
          </button>
          <button
            type="button"
            aria-label={`${habit.name}下移`}
            disabled={index === siblings.length - 1}
            onClick={async () => {
              await moveHabitInGroup(habit.id, 1);
              await onReload();
            }}
          >
            ↓
          </button>
        </div>
        <div className="project-actions">
          <button
            className="project-edit-button"
            type="button"
            aria-label={`编辑${habit.name}`}
            onClick={() => openHabitEditor(habit)}
          >
            <span aria-hidden="true">✎</span>
            编辑
          </button>
          <button
            className="project-more-button"
            type="button"
            aria-label={`${habit.name}更多操作`}
            aria-expanded={openProjectMenu === habit.id}
            onClick={() =>
              setOpenProjectMenu(
                openProjectMenu === habit.id ? undefined : habit.id,
              )
            }
          >
            •••
          </button>
        </div>
        <label className="switch-control">
          <input
            type="checkbox"
            checked={habit.enabled}
            aria-label={`启用${habit.name}`}
            onChange={async () => {
              await saveHabit({ ...habit, enabled: !habit.enabled });
              await onReload();
            }}
          />
          <span />
        </label>
        {openProjectMenu === habit.id ? (
          <div className="project-menu" role="menu">
            <button
              type="button"
              role="menuitem"
              disabled={busy}
              onClick={() => void duplicateHabit(habit)}
            >
              <span aria-hidden="true">＋</span>
              复制项目
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={async () => {
                await saveHabit({ ...habit, enabled: !habit.enabled });
                setOpenProjectMenu(undefined);
                await onReload();
              }}
            >
              <span aria-hidden="true">{habit.enabled ? "Ⅱ" : "▶"}</span>
              {habit.enabled ? "停用项目" : "启用项目"}
            </button>
            <button
              className="archive-menu-button"
              type="button"
              role="menuitem"
              onClick={() => {
                setOpenProjectMenu(undefined);
                setConfirmArchive(habit);
              }}
            >
              <span aria-hidden="true">⌁</span>
              归档项目
            </button>
          </div>
        ) : null}
      </article>
    );
  }

  return (
    <div className="page-stack settings-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">你的节奏，你来定义</p>
          <h1>设置</h1>
        </div>
        <span className="version-badge">v1.2</span>
      </header>

      {notice ? (
        <div className="inline-notice" role="status">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(undefined)} aria-label="关闭提示">
            ×
          </button>
        </div>
      ) : null}

      <section className="settings-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">每日事项</p>
            <h2>分组与项目</h2>
          </div>
          <div className="management-create-actions">
            <button
              className="button button-small button-secondary"
              type="button"
              onClick={() =>
                setEditingGroup({
                  ...EMPTY_GROUP,
                  color: getSuggestedHabitColor(
                    activeGroups.map((group) => ({
                      ...group,
                      maxScore: 10,
                      weight: 1,
                      enabled: true,
                    })),
                  ),
                })
              }
            >
              ＋ 分组
            </button>
            <button
              className="button button-small button-primary"
              type="button"
              onClick={() =>
                setEditingHabit({
                  ...EMPTY_HABIT,
                  color: getSuggestedHabitColor(
                    habits.filter((habit) => !habit.archived),
                  ),
                })
              }
            >
              ＋ 项目
            </button>
          </div>
        </div>
        <p className="management-help">
          拖动项目可调整顺序或跨组移动；触摸设备也可使用分组选择器和上下按钮。
        </p>
        <div className="group-management-list">
          {managementSections.map(({ group, habits: members }, groupIndex) => {
            const isCollapsed = settings.collapsedGroupIds.includes(group.id);
            return (
              <section
                className={`management-group ${isCollapsed ? "is-collapsed" : ""}`}
                key={group.id}
                style={{ "--group-color": group.color } as React.CSSProperties}
                data-group-drop={group.id}
                data-group-id={group.id}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  void dropHabit(group.id);
                }}
              >
                <div className="management-group-header">
                  <button
                    className="management-group-toggle"
                    type="button"
                    aria-expanded={!isCollapsed}
                    onClick={() => toggleManagedGroup(group.id)}
                  >
                    <span className="management-group-icon" aria-hidden="true">
                      {group.icon || "◫"}
                    </span>
                    <span>
                      <strong>{group.name}</strong>
                      <small>{members.length} 个项目</small>
                    </span>
                    <i aria-hidden="true">⌄</i>
                  </button>
                  <div className="management-group-actions">
                    <button
                      type="button"
                      aria-label={`${group.name}上移`}
                      disabled={groupIndex === 0}
                      onClick={async () => {
                        await moveHabitGroup(group.id, -1);
                        await onReload();
                      }}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label={`${group.name}下移`}
                      disabled={groupIndex === managementSections.length - 1}
                      onClick={async () => {
                        await moveHabitGroup(group.id, 1);
                        await onReload();
                      }}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setEditingGroup({
                          id: group.id,
                          name: group.name,
                          icon: group.icon ?? "◫",
                          color: group.color,
                        })
                      }
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      aria-label={`归档${group.name}`}
                      onClick={() =>
                        setConfirmGroupArchive({
                          group,
                          mode: "ungroup-habits",
                        })
                      }
                    >
                      •••
                    </button>
                  </div>
                </div>
                <div className="management-group-content" aria-hidden={isCollapsed}>
                  <div className="management-group-content-inner">
                    <div className="project-list">
                      {members.map((habit, index) =>
                        renderManagedHabit(habit, index, members),
                      )}
                      {!members.length ? (
                        <p className="empty-group-dropzone">
                          拖动项目到这里加入“{group.name}”
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              </section>
            );
          })}
          <section
            className="management-group ungrouped-management"
            data-group-drop="ungrouped"
            data-group-id=""
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              void dropHabit();
            }}
          >
            <div className="ungrouped-management-header">
              <span aria-hidden="true">•</span>
              <div>
                <strong>未分组</strong>
                <small>{groupedHabits.ungrouped.length} 个项目</small>
              </div>
            </div>
            <div className="project-list">
              {groupedHabits.ungrouped.map((habit, index) =>
                renderManagedHabit(habit, index, groupedHabits.ungrouped),
              )}
              {!groupedHabits.ungrouped.length ? (
                <p className="empty-group-dropzone">拖动项目到这里即可移出分组</p>
              ) : null}
            </div>
          </section>
        </div>
      </section>

      <section className="settings-section">
        <p className="eyebrow">外观与计分</p>
        <h2>偏好</h2>
        <div className="setting-row setting-row-block">
          <div>
            <strong>主题</strong>
            <span>选择更舒服的显示方式</span>
          </div>
          <div className="segmented-control">
            {(["light", "system", "dark"] as ThemeMode[]).map((theme) => (
              <button
                key={theme}
                type="button"
                className={settings.theme === theme ? "active" : ""}
                onClick={() => patchSettings({ theme })}
              >
                {theme === "light" ? "浅色" : theme === "dark" ? "深色" : "跟随系统"}
              </button>
            ))}
          </div>
        </div>
        <div className="setting-row setting-row-block">
          <div>
            <strong>计分方式</strong>
            <span>权重模式会放大重要项目的影响</span>
          </div>
          <div className="segmented-control two">
            <button
              type="button"
              className={settings.scoringMode === "normal" ? "active" : ""}
              onClick={() => patchSettings({ scoringMode: "normal" })}
            >
              普通
            </button>
            <button
              type="button"
              className={settings.scoringMode === "weighted" ? "active" : ""}
              onClick={() => patchSettings({ scoringMode: "weighted" })}
            >
              权重
            </button>
          </div>
        </div>
        <label className="setting-row quick-score-setting">
          <div>
            <strong>快捷分数</strong>
            <span>用英文逗号分隔，范围 0～10</span>
          </div>
          <input
            type="text"
            defaultValue={settings.quickScores.join(", ")}
            aria-label="快捷分数"
            onBlur={(event) => {
              const quickScores = event.target.value
                .split(/[,，\s]+/)
                .map(Number)
                .filter((value) => Number.isInteger(value) && value >= 0 && value <= 10)
                .filter((value, index, values) => values.indexOf(value) === index)
                .sort((a, b) => a - b);
              if (quickScores.length >= 2) void patchSettings({ quickScores });
            }}
          />
        </label>
      </section>

      <section className="settings-section backup-section" id="backup-settings">
        <p className="eyebrow">数据安全</p>
        <h2>iCloud Drive 备份</h2>
        <div className="backup-status">
          <div className="backup-cloud" aria-hidden="true">↥</div>
          <div>
            <strong>{formatBackupDate(settings.lastBackupAt)}</strong>
            <span>建议每 7 天保存一次完整 JSON 快照</span>
          </div>
        </div>
        <button
          className="button button-primary button-wide"
          type="button"
          disabled={busy}
          onClick={handleBackup}
        >
          {busy ? "正在准备…" : "备份到 iCloud"}
        </button>
        <button
          className="button button-secondary button-wide"
          type="button"
          onClick={() => fileInput.current?.click()}
        >
          从 iCloud 恢复
        </button>
        <input
          ref={fileInput}
          className="visually-hidden"
          type="file"
          accept="application/json,.json"
          onChange={(event) => void readRestoreFile(event.target.files?.[0])}
        />
        <p className="privacy-copy">
          备份文件由你通过系统分享面板保存；应用不会在后台访问 iCloud。
        </p>
      </section>

      <section className="settings-section">
        <p className="eyebrow">本机存储</p>
        <h2>空间与持久化</h2>
        <div className="storage-grid">
          <div>
            <span>本地数据</span>
            <strong>{formatBytes(storageStatus.usage)}</strong>
          </div>
          <div>
            <span>预计可用</span>
            <strong>{formatBytes(storageStatus.quota)}</strong>
          </div>
          <div>
            <span>持久化状态</span>
            <strong>{storageStatus.persisted ? "已确认" : "尽力保存"}</strong>
          </div>
        </div>
        <p className="privacy-copy">
          本地存储仍可能因清理网站数据、删除主屏幕 App 或设备故障而丢失。
        </p>
      </section>

      <section className="settings-section about-section">
        <div className="setting-row">
          <div>
            <strong>隐私</strong>
            <span>无账号、无广告、无第三方统计</span>
          </div>
          <span className="local-badge">仅本机</span>
        </div>
        <div className="setting-row">
          <div>
            <strong>离线能力</strong>
            <span>主屏幕安装后可在无网络时使用</span>
          </div>
          <span className="local-badge">可用</span>
        </div>
        <button className="danger-link" type="button" onClick={() => setConfirmClear(true)}>
          清空全部数据
        </button>
      </section>

      <Modal
        open={Boolean(editingHabit)}
        title={editingHabit?.id ? "编辑评分项目" : "新增评分项目"}
        description="项目满分和权重会影响每日汇总。"
        primaryLabel={busy ? "保存中…" : "保存项目"}
        onPrimary={() => void submitHabit()}
        onClose={() => setEditingHabit(undefined)}
      >
        {editingHabit ? (
          <div className="habit-form">
            <label>
              <span>项目名称</span>
              <input
                type="text"
                value={editingHabit.name}
                maxLength={24}
                autoFocus
                onChange={(event) =>
                  setEditingHabit({ ...editingHabit, name: event.target.value })
                }
              />
            </label>
            <label>
              <span>描述</span>
              <input
                type="text"
                value={editingHabit.description}
                maxLength={60}
                onChange={(event) =>
                  setEditingHabit({ ...editingHabit, description: event.target.value })
                }
              />
            </label>
            <label>
              <span>所属分组</span>
              <select
                value={editingHabit.groupId ?? ""}
                onChange={(event) =>
                  setEditingHabit({
                    ...editingHabit,
                    groupId: event.target.value || undefined,
                  })
                }
              >
                <option value="">未分组</option>
                {activeGroups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.icon || "◫"} {group.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-grid">
              <label>
                <span>图标</span>
                <input
                  type="text"
                  value={editingHabit.icon}
                  maxLength={4}
                  onChange={(event) =>
                    setEditingHabit({ ...editingHabit, icon: event.target.value })
                  }
                />
              </label>
              <label>
                <span>满分</span>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={editingHabit.maxScore}
                  onChange={(event) =>
                    setEditingHabit({
                      ...editingHabit,
                      maxScore: Number(event.target.value),
                    })
                  }
                />
              </label>
              <label>
                <span>权重</span>
                <input
                  type="number"
                  min="0.1"
                  max="100"
                  step="0.1"
                  value={editingHabit.weight}
                  onChange={(event) =>
                    setEditingHabit({
                      ...editingHabit,
                      weight: Number(event.target.value),
                    })
                  }
                />
              </label>
            </div>
            <fieldset className="color-picker">
              <legend>项目颜色</legend>
              <div>
                {HABIT_COLORS.map((color, index) => (
                  <button
                    key={color}
                    type="button"
                    className={editingHabit.color === color ? "active" : ""}
                    style={{ "--swatch-color": color } as React.CSSProperties}
                    aria-label={`选择第 ${index + 1} 种项目颜色`}
                    aria-pressed={editingHabit.color === color}
                    onClick={() => void chooseHabitColor(color)}
                  >
                    {editingHabit.color === color ? "✓" : ""}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(confirmArchive)}
        title={`归档“${confirmArchive?.name ?? ""}”？`}
        description="它将从今日打卡中隐藏，但所有历史评分都会保留。"
        primaryLabel="确认归档"
        primaryDanger
        onPrimary={async () => {
          if (!confirmArchive) return;
          await archiveHabit(confirmArchive.id);
          setConfirmArchive(undefined);
          await onReload();
        }}
        onClose={() => setConfirmArchive(undefined)}
      />

      <Modal
        open={Boolean(editingGroup)}
        title={editingGroup?.id ? "编辑分组" : "新建分组"}
        description="分组只负责整理项目，不会改变任何评分或历史记录。"
        primaryLabel={busy ? "保存中…" : "保存分组"}
        onPrimary={() => void submitGroup()}
        onClose={() => setEditingGroup(undefined)}
      >
        {editingGroup ? (
          <div className="habit-form">
            <label>
              <span>分组名称</span>
              <input
                type="text"
                value={editingGroup.name}
                maxLength={24}
                autoFocus
                onChange={(event) =>
                  setEditingGroup({
                    ...editingGroup,
                    name: event.target.value,
                  })
                }
              />
            </label>
            <label>
              <span>图标</span>
              <input
                type="text"
                value={editingGroup.icon}
                maxLength={4}
                onChange={(event) =>
                  setEditingGroup({
                    ...editingGroup,
                    icon: event.target.value,
                  })
                }
              />
            </label>
            <fieldset className="color-picker">
              <legend>分组颜色</legend>
              <div>
                {HABIT_COLORS.map((color, index) => (
                  <button
                    key={color}
                    type="button"
                    className={editingGroup.color === color ? "active" : ""}
                    style={{ "--swatch-color": color } as React.CSSProperties}
                    aria-label={`选择第 ${index + 1} 种分组颜色`}
                    aria-pressed={editingGroup.color === color}
                    onClick={() =>
                      setEditingGroup({ ...editingGroup, color })
                    }
                  >
                    {editingGroup.color === color ? "✓" : ""}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(confirmGroupArchive)}
        title={`归档“${confirmGroupArchive?.group.name ?? ""}”？`}
        description="历史评分永远不会被删除。请选择组内项目的处理方式。"
        primaryLabel={busy ? "处理中…" : "确认归档"}
        primaryDanger
        onPrimary={async () => {
          if (!confirmGroupArchive) return;
          setBusy(true);
          try {
            await archiveHabitGroup(
              confirmGroupArchive.group.id,
              confirmGroupArchive.mode,
            );
            setConfirmGroupArchive(undefined);
            setNotice("分组已安全归档，历史评分保持不变。");
            await onReload();
          } catch (error) {
            setNotice((error as Error).message);
          } finally {
            setBusy(false);
          }
        }}
        onClose={() => setConfirmGroupArchive(undefined)}
      >
        {confirmGroupArchive ? (
          <div className="group-archive-options">
            <label>
              <input
                type="radio"
                name="group-archive-mode"
                checked={confirmGroupArchive.mode === "archive-habits"}
                onChange={() =>
                  setConfirmGroupArchive({
                    ...confirmGroupArchive,
                    mode: "archive-habits",
                  })
                }
              />
              <span>
                <strong>同时归档组内项目</strong>
                <small>项目从今日页面隐藏，历史评分继续保留</small>
              </span>
            </label>
            <label>
              <input
                type="radio"
                name="group-archive-mode"
                checked={confirmGroupArchive.mode === "ungroup-habits"}
                onChange={() =>
                  setConfirmGroupArchive({
                    ...confirmGroupArchive,
                    mode: "ungroup-habits",
                  })
                }
              />
              <span>
                <strong>保留项目并移动到“未分组”</strong>
                <small>项目继续正常评分，只移除分组关系</small>
              </span>
            </label>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={backupConfirm}
        title="确认备份已保存"
        description="请确认你已在系统菜单中选择“存储到文件”并保存到 iCloud Drive。"
        primaryLabel="我已保存"
        onPrimary={() => void confirmBackupSaved()}
        onClose={() => setBackupConfirm(false)}
      />

      <Modal
        open={Boolean(pendingRestore)}
        title="用备份覆盖当前数据？"
        description={
          pendingRestore
            ? `备份于 ${new Intl.DateTimeFormat("zh-CN", {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(pendingRestore.exportedAt))}，包含 ${pendingRestore.dailyRecords.length} 天记录。恢复前会先下载当前数据副本。`
            : undefined
        }
        primaryLabel={busy ? "恢复中…" : "确认恢复"}
        primaryDanger
        onPrimary={() => void confirmRestore()}
        onClose={() => setPendingRestore(undefined)}
      />

      <Modal
        open={confirmClear}
        title="清空全部本机数据？"
        description="这会删除所有项目、评分、备注和设置，且无法撤销。请先完成 iCloud 备份。"
        primaryLabel="确认全部清空"
        primaryDanger
        onPrimary={async () => {
          setBusy(true);
          await clearAllData();
          clearHabitColorOverrides();
          clearMilestoneHistory();
          setConfirmClear(false);
          setBusy(false);
          setNotice("数据已清空，并重新创建了默认项目。");
          await onReload();
        }}
        onClose={() => setConfirmClear(false)}
      />
    </div>
  );
}
