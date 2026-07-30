"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BottomNav } from "@/app/components/BottomNav";
import { HistoryPage } from "@/app/components/HistoryPage";
import { InstallGuide } from "@/app/components/InstallGuide";
import { SettingsPage } from "@/app/components/SettingsPage";
import { StatisticsPage } from "@/app/components/StatisticsPage";
import { TodayPage } from "@/app/components/TodayPage";
import { getLocalDateKey } from "@/app/lib/date";
import { getStorageStatus, requestPersistentStorage } from "@/app/lib/storage";
import type {
  AppSettings,
  DailyRecord,
  Habit,
  HabitGroup,
  HabitScore,
  StorageStatus,
} from "@/app/lib/types";
import {
  getAllRecords,
  getAllScores,
  getSettings,
  initializeApp,
  listHabitGroups,
  listHabits,
} from "@/app/repositories/appRepository";
import { useUIStore } from "@/app/stores/uiStore";

const EMPTY_STORAGE: StorageStatus = { persisted: false, usage: 0, quota: 0 };

function shouldShowInstallGuide(): boolean {
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    navigatorWithStandalone.standalone === true;
  return (
    isIOS &&
    !isStandalone &&
    sessionStorage.getItem("daily-score-preview") !== "true"
  );
}

export function DailyScoreApp() {
  const {
    activeTab,
    selectedDate,
    statisticsRange,
    setActiveTab,
    setSelectedDate,
    setStatisticsRange,
  } = useUIStore();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [groups, setGroups] = useState<HabitGroup[]>([]);
  const [records, setRecords] = useState<DailyRecord[]>([]);
  const [scores, setScores] = useState<HabitScore[]>([]);
  const [settings, setSettings] = useState<AppSettings>();
  const [storageStatus, setStorageStatus] = useState(EMPTY_STORAGE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [installGuide, setInstallGuide] = useState(false);
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [bootTime] = useState(() => Date.now());
  const [updateReady, setUpdateReady] = useState<ServiceWorkerRegistration>();

  const reload = useCallback(async () => {
    const [
      nextHabits,
      nextGroups,
      nextRecords,
      nextScores,
      nextSettings,
      nextStorage,
    ] =
      await Promise.all([
        listHabits(true),
        listHabitGroups(true),
        getAllRecords(),
        getAllScores(),
        getSettings(),
        getStorageStatus(),
      ]);
    setHabits(nextHabits);
    setGroups(nextGroups);
    setRecords(nextRecords);
    setScores(nextScores);
    setSettings(nextSettings);
    setStorageStatus(nextStorage);
  }, []);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    async function boot() {
      await Promise.resolve();
      setInstallGuide(shouldShowInstallGuide());
      try {
        await initializeApp();
        await requestPersistentStorage();
        await reload();
      } catch {
        setError("无法打开本机数据库。你仍可以前往设置选择备份文件恢复。");
      } finally {
        setLoading(false);
      }
    }
    void boot();

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => {
          if (registration.waiting) setUpdateReady(registration);
          registration.addEventListener("updatefound", () => {
            const worker = registration.installing;
            worker?.addEventListener("statechange", () => {
              if (worker.state === "installed" && navigator.serviceWorker.controller) {
                setUpdateReady(registration);
              }
            });
          });
        })
        .catch(() => undefined);
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [reload]);

  useEffect(() => {
    if (!settings) return;
    document.documentElement.dataset.theme = settings.theme;
  }, [settings]);

  const showBackupReminder = useMemo(() => {
    if (!settings) return false;
    const checkedDays = records.filter((record) => record.status !== "empty").length;
    if (!settings.lastBackupAt) return checkedDays >= 3;
    return bootTime - settings.lastBackupAt > 7 * 24 * 60 * 60 * 1_000;
  }, [bootTime, records, settings]);

  function openBackupSettings() {
    setActiveTab("settings");
    window.setTimeout(() => {
      document.getElementById("backup-settings")?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  }

  if (installGuide) {
    return (
      <InstallGuide
        onPreview={() => {
          sessionStorage.setItem("daily-score-preview", "true");
          setInstallGuide(false);
        }}
      />
    );
  }

  if (loading) {
    return (
      <main className="boot-screen app-shell" role="status">
        <div className="install-mark">日</div>
        <div className="boot-pulse" />
        <p>正在从这台设备读取记录</p>
      </main>
    );
  }

  if (error || !settings) {
    return (
      <main className="error-screen app-shell">
        <div className="error-mark">!</div>
        <h1>本机数据暂时无法打开</h1>
        <p>{error}</p>
        <button className="button button-primary" type="button" onClick={() => location.reload()}>
          重新尝试
        </button>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <div className="desktop-brand" aria-hidden="true">
        <div className="install-mark">日</div>
        <div>
          <strong>每日评分</strong>
          <span>把每一天变得可见</span>
        </div>
      </div>
      <main className="app-content">
        <div className="connection-pill">
          <span className={online ? "online" : "offline"} />
          {online ? "数据仅存本机" : "离线使用中"}
        </div>
        {activeTab === "today" ? (
          <TodayPage
            dateKey={getLocalDateKey()}
            habits={habits}
            groups={groups}
            records={records}
            settings={settings}
            showBackupReminder={showBackupReminder}
            onOpenBackup={openBackupSettings}
            onSaved={reload}
          />
        ) : null}
        {activeTab === "history" ? (
          <HistoryPage
            habits={habits}
            groups={groups}
            records={records}
            settings={settings}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            onSaved={reload}
          />
        ) : null}
        {activeTab === "statistics" ? (
          <StatisticsPage
            habits={habits}
            records={records}
            scores={scores}
            range={statisticsRange}
            onRangeChange={setStatisticsRange}
          />
        ) : null}
        {activeTab === "settings" ? (
          <SettingsPage
            habits={habits}
            groups={groups}
            settings={settings}
            storageStatus={storageStatus}
            onReload={reload}
          />
        ) : null}
      </main>

      <BottomNav active={activeTab} onChange={setActiveTab} />

      {updateReady ? (
        <div className="update-toast" role="status">
          <div>
            <strong>新版本已准备好</strong>
            <span>当前记录保存后再更新</span>
          </div>
          <button
            type="button"
            onClick={() => {
              updateReady.waiting?.postMessage({ type: "SKIP_WAITING" });
              navigator.serviceWorker.addEventListener(
                "controllerchange",
                () => location.reload(),
                { once: true },
              );
            }}
          >
            更新
          </button>
        </div>
      ) : null}
    </div>
  );
}
