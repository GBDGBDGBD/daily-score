"use client";

import type { AppTab } from "@/app/lib/types";

const NAV_ITEMS: Array<{ id: AppTab; label: string; icon: string }> = [
  { id: "today", label: "今日", icon: "✦" },
  { id: "history", label: "历史", icon: "◫" },
  { id: "statistics", label: "统计", icon: "↗" },
  { id: "settings", label: "设置", icon: "◉" },
];

interface BottomNavProps {
  active: AppTab;
  onChange: (tab: AppTab) => void;
}

export function BottomNav({ active, onChange }: BottomNavProps) {
  return (
    <nav className="bottom-navigation" aria-label="主要导航">
      {NAV_ITEMS.map((item) => (
        <button
          key={item.id}
          type="button"
          className={active === item.id ? "active" : ""}
          aria-current={active === item.id ? "page" : undefined}
          onClick={() => {
            onChange(item.id);
            window.scrollTo({ top: 0, left: 0, behavior: "auto" });
          }}
        >
          <span className="nav-icon" aria-hidden="true">
            {item.icon}
          </span>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
