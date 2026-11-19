"use client";
// The search box with autocomplete. Typing asks /api/suggest (on this site) for names after a short pause;
// arrow keys move through suggestions, Enter picks one, Escape closes the list.

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function SearchBox({ initial = "", label = "Medicine name" }: { initial?: string; label?: string }) {
  const router = useRouter();
  const listId = useId();
  const [value, setValue] = useState(initial);
  const [items, setItems] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const latest = useRef(""); // ignore answers to older keystrokes that arrive late

  useEffect(() => {
    const q = value.trim();
    if (q.length < 2) {
      setItems([]);
      return;
    }
    latest.current = q;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/suggest?q=${encodeURIComponent(q)}`);
        const data = (await res.json()) as { suggestions: string[] };
        if (latest.current === q) {
          setItems(data.suggestions);
          setActive(-1);
        }
      } catch {
        /* suggestions are optional */
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [value]);

  function go(name: string) {
    const q = name.trim();
    if (q.length < 2) return;
    setOpen(false);
    router.push(`/medicine?q=${encodeURIComponent(q)}`);
  }

  const showList = open && items.length > 0;

  return (
    <div className="search">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          go(active >= 0 ? items[active] : value);
        }}
      >
        <label htmlFor={`${listId}-input`} className="sr-only">
          {label}
        </label>
        <input
          id={`${listId}-input`}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (!showList) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => (i + 1) % items.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => (i <= 0 ? items.length - 1 : i - 1));
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder="Brand or generic name, e.g. Adderall or metformin"
          autoComplete="off"
          spellCheck={false}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        />
        <button type="submit">Check</button>
      </form>
      {showList && (
        <ul id={listId} role="listbox" className="suggestions">
          {items.map((s, i) => (
            <li
              key={s}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                setValue(s);
                go(s);
              }}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
