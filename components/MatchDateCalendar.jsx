"use client";

import { useEffect, useMemo, useRef } from "react";
import { X } from "lucide-react";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 12);
}

function addMonths(date, amount) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1, 12);
}

function buildMonth(date) {
  const first = monthStart(date);
  const offset = (first.getDay() + 6) % 7;
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return {
    date: first,
    label: first.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
    cells: [
      ...Array.from({ length: offset }, () => null),
      ...Array.from({ length: days }, (_, index) => new Date(first.getFullYear(), first.getMonth(), index + 1, 12)),
    ],
  };
}

export default function MatchDateCalendar({ open, selectedDate, t, onSelect, onClose }) {
  const scrollRef = useRef(null);
  const today = useMemo(() => new Date(), []);
  const selected = useMemo(() => selectedDate ? new Date(`${selectedDate}T12:00:00`) : today, [selectedDate, today]);
  const selectedMonthKey = `${selected.getFullYear()}-${selected.getMonth()}`;
  const months = useMemo(() => {
    const todayMonth = monthStart(today);
    const selectedMonth = monthStart(selected);
    const earliest = selectedMonth < addMonths(todayMonth, -12) ? selectedMonth : addMonths(todayMonth, -12);
    const latest = selectedMonth > addMonths(todayMonth, 18) ? selectedMonth : addMonths(todayMonth, 18);
    const count = (latest.getFullYear() - earliest.getFullYear()) * 12 + latest.getMonth() - earliest.getMonth() + 1;
    return Array.from({ length: count }, (_, index) => buildMonth(addMonths(earliest, index)));
  }, [selected, today]);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => {
      scrollRef.current?.querySelector(`[data-month="${selectedMonthKey}"]`)?.scrollIntoView({ block: "start" });
    }, 0);
    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, selectedMonthKey]);

  if (!open) return null;
  const todayKey = localDateKey(today);

  return (
    <div className="fixed inset-0 flex items-end justify-center" style={{ zIndex: 80, background: "rgba(0,0,0,0.46)" }} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-label="Choose match date" className="w-full overflow-hidden" style={{ maxWidth: 480, height: "min(84vh, 760px)", borderRadius: "30px 30px 0 0", background: t.card, color: t.text, border: `1px solid ${t.pillBorder}`, boxShadow: "0 -18px 50px rgba(0,0,0,0.36)" }}>
        <div className="flex items-center justify-between" style={{ height: 86, padding: "0 22px" }}>
          <button type="button" onClick={onClose} aria-label="Close calendar" className="flex items-center justify-center rounded-full" style={{ width: 46, height: 46, background: t.pill, color: t.text }}>
            <X size={25} />
          </button>
          <button type="button" onClick={() => { onSelect(todayKey); onClose(); }} className="rounded-full" style={{ height: 46, minWidth: 104, padding: "0 24px", background: t.accent, color: "#07130B", fontSize: 14 }}>
            Today
          </button>
        </div>

        <div className="grid grid-cols-7" style={{ height: 48, padding: "0 22px", alignItems: "center", background: t.pill, borderTop: `1px solid ${t.divider}`, borderBottom: `1px solid ${t.divider}` }}>
          {WEEKDAYS.map((weekday, index) => <span key={`${weekday}-${index}`} style={{ textAlign: "center", color: t.dim, fontSize: 12 }}>{weekday}</span>)}
        </div>

        <div ref={scrollRef} className="overflow-y-auto no-scrollbar" style={{ height: "calc(100% - 134px)", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch" }}>
          {months.map((month) => {
            const key = `${month.date.getFullYear()}-${month.date.getMonth()}`;
            return (
              <div key={key} data-month={key} style={{ padding: "24px 22px 14px", scrollMarginTop: 4 }}>
                <h2 style={{ margin: "0 0 14px", color: t.text, fontSize: 19 }}>{month.label}</h2>
                <div className="grid grid-cols-7" style={{ rowGap: 9 }}>
                  {month.cells.map((day, index) => {
                    if (!day) return <span key={`blank-${index}`} style={{ height: 42 }} />;
                    const dayKey = localDateKey(day);
                    const selectedDay = dayKey === selectedDate;
                    const currentDay = dayKey === todayKey;
                    return (
                      <button
                        type="button"
                        key={dayKey}
                        aria-label={day.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                        aria-pressed={selectedDay}
                        onClick={() => { onSelect(dayKey); onClose(); }}
                        className="justify-self-center rounded-full"
                        style={{ width: 42, height: 42, color: selectedDay ? "#07130B" : t.text, background: selectedDay ? t.accent : "transparent", border: currentDay && !selectedDay ? `1px solid ${t.accent}` : "1px solid transparent", fontSize: 14 }}
                      >
                        {day.getDate()}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
