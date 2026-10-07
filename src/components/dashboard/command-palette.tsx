"use client";

import { Dialog } from "@base-ui/react/dialog";
import {
  ArrowRight,
  BookPlus,
  CornerDownLeft,
  FlaskConical,
  Mail,
  MessageCircle,
  Moon,
  Search,
  Store,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { searchConversations, type ConversationHit } from "@/app/(dashboard)/search-actions";
import { NAV_GROUPS } from "@/components/dashboard/nav";
import { STATUS_LABEL, asStatus } from "@/lib/inbox/labels";
import { cn } from "@/lib/utils";

import { matches } from "./command-match";

type Item = { id: string; group: string; title: string; hint?: string; icon: LucideIcon; run: () => void; keywords?: string };

/** Opens the palette from anywhere (sidebar button, header, etc.). */
export const OPEN_PALETTE_EVENT = "deskpilot:open-palette";
export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_PALETTE_EVENT));
}

export function CommandPalette() {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [hits, setHits] = useState<ConversationHit[]>([]);
  const [searching, startSearch] = useTransition();
  const listRef = useRef<HTMLDivElement>(null);

  // Ctrl/⌘+K toggles; "/" opens when not typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "/" && !typing && !open) {
        e.preventDefault();
        setOpen(true);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpen);
    };
  }, [open]);

  // Conversation search (debounced) whenever the palette is open.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => startSearch(async () => setHits(await searchConversations(query))), 180);
    return () => clearTimeout(t);
  }, [open, query]);

  const go = (href: string) => () => router.push(href);
  const items = useMemo<Item[]>(() => {
    const pages: Item[] = NAV_GROUPS.flatMap((g) =>
      g.items.map((n) => ({ id: `page:${n.href}`, group: "Go to", title: n.title, icon: n.icon, run: go(n.href), keywords: g.label })),
    );
    const actions: Item[] = [
      { id: "a:policy", group: "Actions", title: "Add a policy", hint: "Train", icon: BookPlus, run: go("/train?kind=policy"), keywords: "returns shipping knowledge faq" },
      { id: "a:test", group: "Actions", title: "Try the agent on the sample store", hint: "Test", icon: FlaskConical, run: go("/test"), keywords: "sandbox demo" },
      { id: "a:store", group: "Actions", title: "Connect or reconnect Shopify", hint: "Store", icon: Store, run: go("/store"), keywords: "shopify connect" },
      { id: "a:email", group: "Actions", title: "Set up support email forwarding", hint: "Settings", icon: Mail, run: go("/settings"), keywords: "gmail outlook forward" },
      { id: "a:chat", group: "Actions", title: "Turn on chat on your store", hint: "Settings", icon: MessageCircle, run: go("/settings"), keywords: "widget bubble storefront" },
      {
        id: "a:theme",
        group: "Actions",
        title: resolvedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode",
        icon: resolvedTheme === "dark" ? Sun : Moon,
        run: () => setTheme(resolvedTheme === "dark" ? "light" : "dark"),
        keywords: "theme appearance dark light",
      },
    ];
    const conversations: Item[] = hits.map((h) => ({
      id: `c:${h.id}`,
      group: query.trim() ? "Conversations" : "Recent conversations",
      title: h.subject,
      hint: `${h.who} · ${STATUS_LABEL[asStatus(h.status)]}`,
      icon: h.channel === "chat" ? MessageCircle : Mail,
      run: go(`/inbox/${h.id}`),
    }));
    return [...pages, ...actions].filter((i) => matches(query, `${i.title} ${i.keywords ?? ""} ${i.hint ?? ""}`)).concat(conversations);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, hits, resolvedTheme]);

  const select = (item: Item | undefined) => {
    if (!item) return;
    setOpen(false);
    item.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = (active + (e.key === "ArrowDown" ? 1 : -1) + items.length) % Math.max(items.length, 1);
      setActive(next);
      listRef.current?.querySelector(`[data-index="${next}"]`)?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      select(items[active]);
    }
  };

  const groups = items.reduce<Record<string, { item: Item; index: number }[]>>((acc, item, index) => {
    (acc[item.group] ??= []).push({ item, index });
    return acc;
  }, {});

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setQuery("");
          setActive(0);
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-foreground/20 backdrop-blur-[2px] transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup
          aria-label="Search and commands"
          className="fixed top-[12vh] left-1/2 z-50 flex max-h-[70vh] w-[min(640px,calc(100vw-2rem))] -translate-x-1/2 flex-col overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-lift transition duration-150 data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0"
        >
          <div className="flex items-center gap-3 border-b px-4">
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              placeholder="Search pages, actions and conversations…"
              aria-label="Search"
              role="combobox"
              aria-expanded
              aria-controls="command-list"
              aria-activedescendant={items[active] ? `cmd-${active}` : undefined}
              className="h-14 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
            />
            {searching && <span className="size-3 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" aria-hidden />}
            <kbd className="hidden rounded-md border bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground sm:block">Esc</kbd>
          </div>

          <div ref={listRef} id="command-list" role="listbox" className="flex-1 overflow-y-auto p-2">
            {items.length === 0 && <p className="px-3 py-10 text-center text-sm text-muted-foreground">No results for &ldquo;{query}&rdquo;</p>}
            {Object.entries(groups).map(([group, entries]) => (
              <div key={group} className="mb-1">
                <p className="px-3 pt-2 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{group}</p>
                {entries.map(({ item, index }) => (
                  <button
                    key={item.id}
                    id={`cmd-${index}`}
                    data-index={index}
                    type="button"
                    role="option"
                    aria-selected={index === active}
                    onMouseMove={() => setActive(index)}
                    onClick={() => select(item)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm",
                      index === active ? "bg-accent text-accent-foreground" : "text-foreground",
                    )}
                  >
                    <item.icon className="size-4 shrink-0 opacity-70" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{item.title}</span>
                    {item.hint && <span className="hidden max-w-[45%] truncate text-xs text-muted-foreground sm:block">{item.hint}</span>}
                    {index === active ? <CornerDownLeft className="size-3.5 opacity-60" aria-hidden /> : <ArrowRight className="size-3.5 opacity-0" aria-hidden />}
                  </button>
                ))}
              </div>
            ))}
          </div>

          <div className="flex items-center gap-4 border-t px-4 py-2 text-[11px] text-muted-foreground">
            <span><kbd className="font-sans">↑↓</kbd> to move</span>
            <span><kbd className="font-sans">Enter</kbd> to open</span>
            <span className="ml-auto"><kbd className="font-sans">Ctrl/⌘ K</kbd> anywhere</span>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
