"use client";

import { useSyncExternalStore } from "react";
import { createStore } from "zustand/vanilla";
import { getLocalDateKey } from "@/app/lib/date";
import type { AppTab } from "@/app/lib/types";

interface UIState {
  activeTab: AppTab;
  selectedDate: string;
  statisticsRange: 7 | 30;
  setActiveTab: (tab: AppTab) => void;
  setSelectedDate: (dateKey: string) => void;
  setStatisticsRange: (range: 7 | 30) => void;
}

const uiStore = createStore<UIState>((set) => ({
  activeTab: "today",
  selectedDate: getLocalDateKey(),
  statisticsRange: 7,
  setActiveTab: (activeTab) => set({ activeTab }),
  setSelectedDate: (selectedDate) => set({ selectedDate }),
  setStatisticsRange: (statisticsRange) => set({ statisticsRange }),
}));

export function useUIStore(): UIState {
  return useSyncExternalStore(
    uiStore.subscribe,
    uiStore.getState,
    uiStore.getInitialState,
  );
}
