import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { paths } from '../routes';
import type { SearchResult } from '../types';

const DEBOUNCE_MS = 200;

// Sidebar title search. Press "/" anywhere to focus; arrows + Enter to pick.
const SearchBar: React.FC = () => {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [settledQuery, setSettledQuery] = useState('');

  // Debounced lookup; stale responses are ignored.
  useEffect(() => {
    const q = query.trim();
    if (!q) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      api.search(q)
        .then(r => { if (!cancelled) { setResults(r.results); setActive(0); } })
        .catch(() => { if (!cancelled) setResults([]); })
        .finally(() => { if (!cancelled) setSettledQuery(q); });
    }, DEBOUNCE_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query]);

  // "/" focuses the search box (unless already typing somewhere).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      if (e.key === '/' && !typing) { e.preventDefault(); inputRef.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Close when clicking elsewhere.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const hasQuery = query.trim().length > 0;
  const loading = hasQuery && settledQuery !== query.trim();
  const shown = hasQuery && !loading ? results : [];

  const go = (r: SearchResult) => {
    setOpen(false);
    setQuery('');
    setResults([]);
    inputRef.current?.blur();
    navigate(r.kind === 'collection' ? paths.collection(r.title) : paths.item(r.serverId!, r.folderName!, r.title));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur(); return; }
    if (!shown.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => (a + 1) % shown.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => (a - 1 + shown.length) % shown.length); }
    else if (e.key === 'Enter') { e.preventDefault(); go(shown[active]); }
  };

  return (
    <div className="search" ref={boxRef}>
      <input
        ref={inputRef}
        className="search__input"
        type="search"
        placeholder="Search library  ( / )"
        aria-label="Search library"
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); if (!e.target.value.trim()) setResults([]); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={open && hasQuery}
        aria-controls="search-results"
        aria-autocomplete="list"
      />
      {open && hasQuery && (
        <ul className="search__results" id="search-results" role="listbox">
          {shown.map((r, i) => (
            <li
              key={`${r.kind}-${r.serverId ?? ''}-${r.folderName ?? ''}-${r.title}`}
              role="option"
              aria-selected={i === active}
              className={`search__item${i === active ? ' search__item--active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={e => e.preventDefault()}
              onClick={() => go(r)}
            >
              {r.imageUrl
                ? <img className="search__thumb" src={r.imageUrl} alt="" loading="lazy" />
                : <span className="search__thumb search__thumb--empty" aria-hidden="true" />}
              <span className="search__text">
                <span className="search__title">{r.title}</span>
                <span className="search__meta">{r.kind === 'collection' ? 'Collection' : r.folderName}</span>
              </span>
            </li>
          ))}
          {!shown.length && <li className="search__empty">{loading ? 'Searching…' : 'No matches'}</li>}
        </ul>
      )}
    </div>
  );
};

export default SearchBar;
