"use client";

import type { KeyboardEvent, ReactNode } from "react";

export type TabItem<Id extends string> = { id: Id; label: string };

const tabId = (prefix: string, id: string) => `${prefix}-tab-${id}`;
const panelId = (prefix: string, id: string) => `${prefix}-panel-${id}`;

/** Accessible tab strip. Panels are rendered by the caller with TabPanel so inactive panels can stay mounted and keep their state. */
export function TabList<Id extends string>({ prefix, label, tabs, value, onChange }: {
  prefix: string;
  label: string;
  tabs: readonly TabItem<Id>[];
  value: Id;
  onChange: (id: Id) => void;
}) {
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = tabs.findIndex((tab) => tab.id === value);
    const next = event.key === "ArrowRight" ? (index + 1) % tabs.length
      : event.key === "ArrowLeft" ? (index - 1 + tabs.length) % tabs.length
      : event.key === "Home" ? 0
      : event.key === "End" ? tabs.length - 1 : -1;
    if (next < 0) return;
    event.preventDefault();
    onChange(tabs[next].id);
    document.getElementById(tabId(prefix, tabs[next].id))?.focus();
  }

  return (
    <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className="flex overflow-x-auto border-b border-slate-700">
      {tabs.map((tab) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            id={tabId(prefix, tab.id)}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={panelId(prefix, tab.id)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-4 py-3 text-sm transition ${selected ? "border-sky-400 text-white" : "border-transparent text-slate-400 hover:text-slate-200"}`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({ prefix, id, active, className = "", children }: {
  prefix: string;
  id: string;
  active: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      role="tabpanel"
      id={panelId(prefix, id)}
      aria-labelledby={tabId(prefix, id)}
      data-tab={id}
      hidden={!active}
      className={`${active ? "" : "hidden"} ${className}`.trim()}
    >
      {children}
    </div>
  );
}
