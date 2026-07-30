"use client";

import { useRef, useState } from "react";
import {
  backupToFile,
  downloadFile,
  MAX_BACKUP_BYTES,
  validateBackup,
} from "@/app/lib/backup";
import {
  clearHabitColorOverrides,
  getHabitColor,
  getSuggestedHabitColor,
  HABIT_COLORS,
  setHabitColor,
} from "@/app/lib/habitColors";
import { clearMilestoneHistory } from "@/app/lib/milestones";
import { formatBytes } from "@/app/lib/storage";
import type {
  AppBackup,
  AppSettings,
  Habit,
  StorageStatus,
  ThemeMode,
} from "@/app/lib/types";
import {
  archiveHabit,
  clearAllData,
  exportAllData,
  moveHabit,
  restoreAllData,
  saveHabit,
  updateSettings,
} from "@/app/repositories/appRepository";
import { Modal } from "@/app/components/Modal";

interface SettingsPageProps {
  habits: Habit[];
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
  settings,
  storageStatus,
  onReload,
}: SettingsPageProps) {
  const [editingHabit, setEditingHabit] = useState<HabitDraft>();
  const [confirmArchive, setConfirmArchive] = useState<Habit>();
  const [confirmClear, setConfirmClear] = useState(false);
  const [backupConfirm, setBackupConfirm] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<AppBackup>();
  const [openProjectMenu, setOpenProjectMenu] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

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
      lastBackupVersion: 1,
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
      const { color, ...habitDraft } = editingHabit;
      const savedHabit = await saveHabit(habitDraft);
      setHabitColor(savedHabit.id, color);
      setEditingHabit(undefined);
      await onReload();
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function duplicateHabit(habit: Habit) {
    setBusy(true);
    try {
      const duplicate = await saveHabit({
        name: `${habit.name} 副本`,
        description: habit.description ?? "",
        icon: habit.icon ?? "✓",
        maxScore: habit.maxScore,
        weight: habit.weight,
        enabled: habit.enabled,
      });
      setHabitColor(duplicate.id, getHabitColor(habit));
      setOpenProjectMenu(undefined);
      setNotice(`已复制“${habit.name}”。`);
      await onReload();
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-stack settings-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">你的节奏，你来定义</p>
          <h1>设置</h1>
        </div>
        <span className="version-badge">v1.1</span>
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
            <h2>项目管理</h2>
          </div>
          <button
            className="button button-small button-primary"
            type="button"
            onClick={() =>
              setEditingHabit({
                ...EMPTY_HABIT,
                color: getSuggestedHabitColor(
                  habits.filter((habit) => !habit.archived).length,
                ),
              })
            }
          >
            ＋ 新增
          </button>
        </div>
        <div className="project-list">
          {habits.filter((habit) => !habit.archived).map((habit, index, activeHabits) => (
            <article
              key={habit.id}
              className={[
                !habit.enabled ? "disabled" : "",
                openProjectMenu === habit.id ? "menu-open" : "",
              ].join(" ")}
              style={
                {
                  "--habit-color": getHabitColor(habit),
                } as React.CSSProperties
              }
            >
              <span className="project-color-rail" aria-hidden="true" />
              <div className="project-icon">{habit.icon || "✓"}</div>
              <div className="project-copy">
                <strong>{habit.name}</strong>
                <span>
                  满分 {habit.maxScore}
                  {settings.scoringMode === "weighted" ? ` · 权重 ${habit.weight}` : ""}
                </span>
              </div>
              <span className={`project-status ${habit.enabled ? "active" : ""}`}>
                {habit.enabled ? "使用中" : "已停用"}
              </span>
              <div className="project-order">
                <button
                  type="button"
                  aria-label={`${habit.name}上移`}
                  title="上移"
                  disabled={index === 0}
                  onClick={async () => {
                    await moveHabit(habit.id, -1);
                    await onReload();
                  }}
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`${habit.name}下移`}
                  title="下移"
                  disabled={index === activeHabits.length - 1}
                  onClick={async () => {
                    await moveHabit(habit.id, 1);
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
                  onClick={() =>
                    setEditingHabit({
                      id: habit.id,
                      name: habit.name,
                      description: habit.description ?? "",
                      icon: habit.icon ?? "✓",
                      maxScore: habit.maxScore,
                      weight: habit.weight,
                      enabled: habit.enabled,
                      color: getHabitColor(habit),
                    })
                  }
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
          ))}
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
                    onClick={() =>
                      setEditingHabit({ ...editingHabit, color })
                    }
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
