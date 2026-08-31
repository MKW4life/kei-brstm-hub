"use client";

import { useMemo, useState } from "react";
import styles from "./AdminTagPicker.module.css";

type AdminTagPickerProps = {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
};

function parseTags(value: string) {
  const tags = value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

  const seen = new Set<string>();
  return tags.filter((tag) => {
    const key = tag.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default function AdminTagPicker({
  label = "タグ",
  value,
  onChange,
  suggestions,
}: AdminTagPickerProps) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);

  const selected = useMemo(() => parseTags(value), [value]);
  const selectedKeys = useMemo(
    () => new Set(selected.map((tag) => tag.toLowerCase())),
    [selected]
  );

  const available = useMemo(() => {
    const keyword = query.trim().toLowerCase();

    return suggestions.filter((tag) => {
      if (selectedKeys.has(tag.toLowerCase())) return false;
      if (!keyword) return true;
      return tag.toLowerCase().includes(keyword);
    });
  }, [suggestions, selectedKeys, query]);

  const visibleSuggestions = query.trim()
    ? available.slice(0, 30)
    : expanded
    ? available.slice(0, 60)
    : available.slice(0, 10);

  function commit(tags: string[]) {
    onChange(parseTags(tags.join(", ")).join(", "));
  }

  function addTag(tag: string) {
    const clean = tag.trim().replace(/^#+/, "");
    if (!clean) return;
    if (selectedKeys.has(clean.toLowerCase())) {
      setQuery("");
      return;
    }

    commit([...selected, clean]);
    setQuery("");
  }

  function removeTag(tag: string) {
    commit(selected.filter((item) => item.toLowerCase() !== tag.toLowerCase()));
  }

  const exactExisting = suggestions.find(
    (tag) => tag.toLowerCase() === query.trim().replace(/^#+/, "").toLowerCase()
  );
  const canCreate =
    query.trim().replace(/^#+/, "").length > 0 &&
    !selectedKeys.has(query.trim().replace(/^#+/, "").toLowerCase());

  return (
    <div className={styles.root}>
      <div className={styles.labelRow}>
        <span className={styles.label}>{label}</span>
        <span className={styles.count}>{selected.length}個選択</span>
      </div>

      {selected.length > 0 && (
        <div className={styles.selected}>
          {selected.map((tag) => (
            <button
              key={tag}
              type="button"
              className={styles.selectedTag}
              onClick={() => removeTag(tag)}
              title="クリックで外す"
            >
              #{tag}<span aria-hidden="true"> ×</span>
            </button>
          ))}
        </div>
      )}

      <div className={styles.searchRow}>
        <input
          className={styles.search}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              if (canCreate) addTag(exactExisting || query);
            }
          }}
          placeholder="タグを検索 / 新しいタグを入力"
        />

        {canCreate && (
          <button
            type="button"
            className={styles.addButton}
            onClick={() => addTag(exactExisting || query)}
          >
            {exactExisting ? "追加" : "新規追加"}
          </button>
        )}

        <button
          type="button"
          className={styles.moreButton}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? "閉じる" : "候補"}
        </button>
      </div>

      {(query.trim() || expanded || visibleSuggestions.length > 0) && (
        <div className={styles.suggestions}>
          {!query.trim() && !expanded && available.length > 0 && (
            <span className={styles.suggestionLabel}>よく使うタグ</span>
          )}

          {visibleSuggestions.map((tag) => (
            <button
              key={tag}
              type="button"
              className={styles.suggestionTag}
              onClick={() => addTag(tag)}
            >
              #{tag}
            </button>
          ))}

          {query.trim() && visibleSuggestions.length === 0 && (
            <span className={styles.empty}>一致する既存タグはありません</span>
          )}
        </div>
      )}

      <input type="hidden" value={value} readOnly />
    </div>
  );
}
