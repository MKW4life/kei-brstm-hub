"use client";

import { useMemo, useState, type CSSProperties, type KeyboardEvent } from "react";

export type TagSuggestion = {
  name: string;
  name_en?: string;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  suggestions: TagSuggestion[];
  language?: "ja" | "en";
  placeholder?: string;
  className?: string;
  style?: CSSProperties;
  onAfterChange?: () => void;
};

function normalize(value: string) {
  return value.trim().replace(/^#+/, "").toLowerCase();
}

export default function TagSearchInput({
  value,
  onChange,
  suggestions,
  language = "ja",
  placeholder,
  className,
  style,
  onAfterChange,
}: Props) {
  const [focused, setFocused] = useState(false);

  const parts = value.split(",");
  const currentFragment = normalize(parts.at(-1) ?? "");

  const selectedKeys = useMemo(() => {
    const selected = value
      .split(",")
      .slice(0, -1)
      .map(normalize)
      .filter(Boolean);

    return new Set(selected);
  }, [value]);

  const matches = useMemo(() => {
    const seen = new Set<string>();

    return suggestions
      .filter((suggestion) => {
        const canonical = normalize(suggestion.name);
        if (!canonical || selectedKeys.has(canonical) || seen.has(canonical)) {
          return false;
        }

        seen.add(canonical);

        if (!currentFragment) return true;

        const english = normalize(suggestion.name_en ?? "");
        return (
          canonical.includes(currentFragment) ||
          Boolean(english && english.includes(currentFragment))
        );
      })
      .slice(0, 8);
  }, [suggestions, selectedKeys, currentFragment]);

  function choose(suggestion: TagSuggestion) {
    const nextParts = value.split(",");
    nextParts[nextParts.length - 1] = suggestion.name;

    const clean: string[] = [];
    const seen = new Set<string>();

    for (const part of nextParts) {
      const trimmed = part.trim().replace(/^#+/, "");
      const key = normalize(trimmed);
      if (!trimmed || seen.has(key)) continue;
      seen.add(key);
      clean.push(trimmed);
    }

    onChange(clean.join(", "));
    onAfterChange?.();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" && focused && matches.length > 0 && currentFragment) {
      event.preventDefault();
      choose(matches[0]);
    }
  }

  const showSuggestions = focused && matches.length > 0;

  return (
    <div style={{ position: "relative", minWidth: 0, width: "100%" }}>
      <input
        className={className}
        style={style}
        type="text"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          onAfterChange?.();
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => window.setTimeout(() => setFocused(false), 120)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoComplete="off"
      />

      {showSuggestions && (
        <div
          style={{
            position: "absolute",
            zIndex: 80,
            top: "calc(100% + 6px)",
            left: 0,
            right: 0,
            display: "grid",
            gap: "4px",
            maxHeight: "280px",
            overflowY: "auto",
            padding: "6px",
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: "12px",
            background: "#111114",
            boxShadow: "0 16px 42px rgba(0,0,0,0.45)",
          }}
        >
          {matches.map((suggestion) => {
            const primary =
              language === "en" && suggestion.name_en?.trim()
                ? suggestion.name_en.trim()
                : suggestion.name;
            const secondary =
              language === "en" && suggestion.name_en?.trim()
                ? suggestion.name
                : suggestion.name_en?.trim() || "";

            return (
              <button
                key={suggestion.name.toLowerCase()}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(suggestion)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "12px",
                  width: "100%",
                  minHeight: "38px",
                  padding: "7px 9px",
                  border: 0,
                  borderRadius: "8px",
                  background: "transparent",
                  color: "#f4f4f5",
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                <span>#{primary}</span>
                {secondary && (
                  <span style={{ fontSize: "11px", color: "#71717a" }}>
                    {secondary}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
