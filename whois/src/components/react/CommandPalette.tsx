import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { searchItems, type SearchGroup, type SearchItem } from '@/lib/search-match';

interface Labels {
  placeholder: string;
  empty: string;
  hint: string;
  close: string;
  groups: Record<SearchGroup, string>;
}

interface Props {
  items: SearchItem[];
  labels: Labels;
}

const GROUP_ORDER: SearchGroup[] = ['pages', 'projects', 'articles', 'talks'];

export default function CommandPalette({ items, labels }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  /** Restores focus to whatever opened the palette, so keyboard users are not dumped at the top. */
  const openerRef = useRef<HTMLElement | null>(null);

  const results = useMemo(() => searchItems(items, query), [items, query]);

  const grouped = useMemo(() => {
    const map = new Map<SearchGroup, SearchItem[]>();
    for (const item of results) {
      const bucket = map.get(item.group);
      if (bucket) bucket.push(item);
      else map.set(item.group, [item]);
    }
    return GROUP_ORDER.filter((group) => map.has(group)).map((group) => ({
      group,
      items: map.get(group) as SearchItem[],
    }));
  }, [results]);

  /** Flattened in render order so arrow keys move through the list as it appears. */
  const flatResults = useMemo(() => grouped.flatMap((section) => section.items), [grouped]);

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    setActiveIndex(0);
    openerRef.current?.focus();
    openerRef.current = null;
  }, []);

  const open = useCallback(() => {
    openerRef.current = document.activeElement as HTMLElement | null;
    setIsOpen(true);
  }, []);

  const navigate = useCallback(
    (item: SearchItem) => {
      close();
      if (item.external) window.open(item.href, '_blank', 'noopener,noreferrer');
      else window.location.href = item.href;
    },
    [close],
  );

  // Global shortcut plus the custom event fired by the header's search button.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
      if (isShortcut) {
        event.preventDefault();
        setIsOpen((wasOpen) => {
          if (wasOpen) return false;
          openerRef.current = document.activeElement as HTMLElement | null;
          return true;
        });
      }
      // `/` is a convenience shortcut, but must not hijack typing in a field.
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
      if (event.key === '/' && !isTyping) {
        event.preventDefault();
        open();
      }
    };

    const onRequestOpen = () => open();

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('palette:open', onRequestOpen);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('palette:open', onRequestOpen);
    };
  }, [open]);

  useEffect(() => {
    if (isOpen) {
      // Focus after paint, otherwise the input is not yet mounted.
      requestAnimationFrame(() => inputRef.current?.focus());
      document.documentElement.style.overflow = 'hidden';
    } else {
      document.documentElement.style.overflow = '';
    }
    return () => {
      document.documentElement.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => setActiveIndex(0), [query]);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (!isOpen) return null;

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => (flatResults.length === 0 ? 0 : (index + 1) % flatResults.length));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) =>
        flatResults.length === 0 ? 0 : (index - 1 + flatResults.length) % flatResults.length,
      );
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const item = flatResults[activeIndex];
      if (item) navigate(item);
    }
  };

  let renderIndex = -1;

  return (
    <div
      className="fixed inset-0 z-100 flex items-start justify-center px-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label={labels.placeholder}
    >
      <button
        type="button"
        aria-label={labels.close}
        onClick={close}
        className="absolute inset-0 cursor-default bg-black/50 backdrop-blur-sm motion-safe:animate-[fade-in_180ms_ease-out]"
      />

      <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-border-strong bg-surface-raised shadow-2xl motion-safe:animate-[palette-in_260ms_cubic-bezier(0.16,1,0.3,1)]">
        <div className="flex items-center gap-3 border-b border-border px-4">
          <svg className="size-4 shrink-0 text-faint" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.6" />
            <path d="m13.5 13.5 3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder={labels.placeholder}
            aria-label={labels.placeholder}
            aria-autocomplete="list"
            aria-controls="palette-results"
            aria-activedescendant={flatResults[activeIndex] ? `palette-${flatResults[activeIndex].id}` : undefined}
            className="w-full bg-transparent py-4 text-[0.95rem] text-text outline-none placeholder:text-faint"
          />
          <kbd className="hidden shrink-0 rounded border border-border px-1.5 py-0.5 font-mono text-[0.65rem] text-faint sm:block">
            ESC
          </kbd>
        </div>

        <div ref={listRef} id="palette-results" role="listbox" className="max-h-[52vh] overflow-y-auto p-2">
          {flatResults.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted">{labels.empty}</p>
          ) : (
            grouped.map((section) => (
              <div key={section.group} className="mb-1">
                <div className="label-mono px-3 py-2">{labels.groups[section.group]}</div>
                {section.items.map((item) => {
                  renderIndex += 1;
                  const index = renderIndex;
                  const isActive = index === activeIndex;
                  return (
                    <div
                      key={item.id}
                      id={`palette-${item.id}`}
                      role="option"
                      aria-selected={isActive}
                      data-active={isActive}
                      onMouseMove={() => setActiveIndex(index)}
                      onClick={() => navigate(item)}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition-colors ${
                        isActive ? 'bg-accent-subtle' : ''
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-text">{item.title}</div>
                        <div className="truncate text-xs text-muted">{item.subtitle}</div>
                      </div>
                      {item.external && (
                        <svg className="size-3.5 shrink-0 text-faint" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                          <path
                            d="M6 3h7v7M13 3 4 12"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                      {isActive && (
                        <span className="hidden shrink-0 items-center gap-1 font-mono text-[0.65rem] text-faint sm:flex">
                          <kbd className="rounded border border-border px-1">↵</kbd>
                          {labels.hint}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>

      <style>{`
        @keyframes fade-in { from { opacity: 0 } }
        @keyframes palette-in {
          from { opacity: 0; transform: translateY(-8px) scale(0.98) }
        }
      `}</style>
    </div>
  );
}
