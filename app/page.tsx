"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type Track = {
  id: number;
  title: string;
  source: string;
  category: string;
  slot_name: string;
  example_ct: string;
  description: string;
  tags: string;
  brstm_url: string;
  preview_url: string;
  brstm_lap3_url: string;
  preview_lap3_url: string;
  download_count: number;
  created_at: string;
};

const translations = {
  ja: {
    subtitle:
      "Mario Kart Wii / CTGP-R 向けミュージックハックを検索・試聴・ダウンロード",
    search: "曲名・タグ・対応スロット・使用例CTで検索",
    all: "すべて",
    wii: "Wiiコース",
    retro: "レトロコース",
    battle: "バトルコース",
    other: "その他BGM",
    newest: "新着順",
    name: "曲名順",
    downloads: "ダウンロード数順",
    published: "公開中のBRSTM",
    slot: "対応スロット",
    example: "使用例CT",
    normal: "通常",
    lap3: "Lap 3",
    preview: "試聴",
    stop: "停止",
    download: "ダウンロード",
    admin: "管理者ログイン",
    empty: "公開中の音源がありません。",
    loading: "読み込み中...",
    error: "曲データを読み込めませんでした。",
    noPreview: "この曲にはプレビュー音源が登録されていません。",
    previewError: "プレビュー音源を再生できませんでした。",
    noDownload: "ダウンロードファイルが未登録です。",
    footer: "掲載音源は管理者が確認して公開しています。",
  },
  en: {
    subtitle:
      "Search, preview, and download music hacks for Mario Kart Wii / CTGP-R",
    search: "Search by title, tags, slot, or example CT",
    all: "All",
    wii: "Wii Courses",
    retro: "Retro Courses",
    battle: "Battle Courses",
    other: "Other Music",
    newest: "Newest",
    name: "Title A-Z",
    downloads: "Most Downloaded",
    published: "Available BRSTMs",
    slot: "Slot",
    example: "Example CT",
    normal: "Normal",
    lap3: "Lap 3",
    preview: "Preview",
    stop: "Stop",
    download: "Download",
    admin: "Admin Login",
    empty: "No published audio found.",
    loading: "Loading...",
    error: "Failed to load track data.",
    noPreview: "No preview audio has been registered for this track.",
    previewError: "The preview audio could not be played.",
    noDownload: "No download file has been registered.",
    footer: "All hosted audio is reviewed by the administrator.",
  },
};

function createDownloadUrl(url: string) {
  if (!url) {
    return "";
  }

  return url.includes("?") ? `${url}&download=` : `${url}?download=`;
}

export default function Home() {
  const [language, setLanguage] = useState<"ja" | "en">("ja");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("すべて");
  const [sort, setSort] = useState("newest");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [playingKey, setPlayingKey] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const t = translations[language];

  useEffect(() => {
    loadTracks();
  }, []);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  async function loadTracks() {
    setLoading(true);
    setLoadError(false);

    const { data, error } = await supabase
      .from("tracks")
      .select("*")
      .eq("is_published", true)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to load tracks:", error);
      setLoadError(true);
      setLoading(false);
      return;
    }

    setTracks((data as Track[]) ?? []);
    setLoading(false);
  }

  const visibleTracks = useMemo(() => {
    const keyword = query.trim().toLowerCase();

    return [...tracks]
      .filter((track) => category === "すべて" || track.category === category)
      .filter((track) => {
        const searchableText = [
          track.title,
          track.source,
          track.category,
          track.slot_name,
          track.example_ct,
          track.description,
          track.tags,
        ]
          .join(" ")
          .toLowerCase();

        return searchableText.includes(keyword);
      })
      .sort((a, b) => {
        if (sort === "name") {
          return a.title.localeCompare(b.title);
        }

        if (sort === "downloads") {
          return b.download_count - a.download_count;
        }

        return b.created_at.localeCompare(a.created_at);
      });
  }, [tracks, query, category, sort]);

  const categories = [
    { value: "すべて", label: t.all },
    { value: "Wiiコース", label: t.wii },
    { value: "レトロコース", label: t.retro },
    { value: "バトルコース", label: t.battle },
    { value: "その他BGM", label: t.other },
  ];

  function handleTagClick(tag: string) {
    setQuery(tag);
    setCategory("すべて");

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  async function handlePreview(track: Track, previewUrl: string, label: string) {
    if (!previewUrl) {
      window.alert(t.noPreview);
      return;
    }

    const key = `${track.id}-${label}`;

    if (playingKey === key && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
      setPlayingKey(null);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    const nextAudio = new Audio(previewUrl);

    nextAudio.addEventListener("ended", () => {
      setPlayingKey(null);
      audioRef.current = null;
    });

    nextAudio.addEventListener("error", () => {
      setPlayingKey(null);
      audioRef.current = null;
      window.alert(t.previewError);
    });

    audioRef.current = nextAudio;
    setPlayingKey(key);

    try {
      await nextAudio.play();
    } catch (error) {
      console.error("Failed to play preview:", error);
      audioRef.current = null;
      setPlayingKey(null);
      window.alert(t.previewError);
    }
  }

  async function handleDownload(track: Track) {
    const { error } = await supabase.rpc("increment_download_count", {
      track_id: track.id,
    });

    if (error) {
      console.error("Failed to increment download count:", error);
      return;
    }

    setTracks((currentTracks) =>
      currentTracks.map((item) =>
        item.id === track.id
          ? { ...item, download_count: item.download_count + 1 }
          : item
      )
    );
  }

  function renderFileButtons(
    track: Track,
    label: string,
    previewUrl: string,
    brstmUrl: string
  ) {
    const key = `${track.id}-${label}`;

    return (
      <div className="fileButtonGroup">
        <span className="fileLabel">{label}</span>

        <button
          className={
            playingKey === key ? "playButton small playing" : "playButton small"
          }
          type="button"
          onClick={() => handlePreview(track, previewUrl, label)}
        >
          {playingKey === key ? "■" : "▶"}
        </button>

        {brstmUrl ? (
          <a
            className="downloadButton"
            href={createDownloadUrl(brstmUrl)}
            onClick={() => handleDownload(track)}
          >
            {t.download}
          </a>
        ) : (
          <button
            className="downloadButton"
            type="button"
            disabled
            title={t.noDownload}
          >
            {t.download}
          </button>
        )}
      </div>
    );
  }

  function renderTags(tags: string) {
    const tagList = tags
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    if (tagList.length === 0) {
      return null;
    }

    return (
      <div className="trackTags">
        {tagList.map((tag) => (
          <button
            className="tag clickableTag"
            key={tag}
            type="button"
            onClick={() => handleTagClick(tag)}
            title={`Search: ${tag}`}
          >
            #{tag}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="page">
      <header className="header">
        <div className="headerInner">
          <Link className="logoArea linkLogo" href="/">
            <div className="logo">♫</div>
            <span>Kei BRSTM Hub</span>
          </Link>

          <div className="headerButtons">
            <button
              className="secondaryButton"
              type="button"
              onClick={() => setLanguage(language === "ja" ? "en" : "ja")}
            >
              {language === "ja" ? "EN" : "JP"}
            </button>

            <Link className="primaryButton linkButton" href="/admin/login">
              {t.admin}
            </Link>
          </div>
        </div>
      </header>

      <main className="main">
        <section className="hero">
          <p className="label">CTGP-R MUSIC LIBRARY</p>
          <h1>Kei BRSTM Hub</h1>
          <p className="subtitle">{t.subtitle}</p>
        </section>

        <section className="controls">
          <div className="controlTop">
            <input
              className="search"
              type="text"
              placeholder={t.search}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />

            <select
              className="sort"
              value={sort}
              onChange={(event) => setSort(event.target.value)}
              aria-label={t.newest}
            >
              <option value="newest">{t.newest}</option>
              <option value="name">{t.name}</option>
              <option value="downloads">{t.downloads}</option>
            </select>
          </div>

          <div className="categories">
            {categories.map((item) => (
              <button
                key={item.value}
                type="button"
                className={
                  category === item.value ? "category active" : "category"
                }
                onClick={() => setCategory(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </section>

        <section className="library">
          <div className="sectionHeader">
            <h2>{t.published}</h2>
            <span>{visibleTracks.length} tracks</span>
          </div>

          {loading && <div className="empty">{t.loading}</div>}

          {loadError && <div className="empty">{t.error}</div>}

          {!loading && !loadError && (
            <div className="trackList">
              {visibleTracks.map((track) => (
                <article className="trackCard" key={track.id}>
                  <div className="trackInfo">
                    <div className="trackTitleRow">
                      <h3>{track.title}</h3>
                      <span className="tag">{track.category}</span>
                    </div>

                    <p className="source">{track.source}</p>

                    <div className="trackMeta">
                      <span>
                        {t.slot}: {track.slot_name || "-"}
                      </span>
                      <span>
                        {t.example}: {track.example_ct || "-"}
                      </span>
                    </div>

                    {track.description && (
                      <p className="description">{track.description}</p>
                    )}

                    {track.tags && renderTags(track.tags)}
                  </div>

                  <div className="trackActions vertical">
                    <span className="downloadCount">
                      ↓ {track.download_count}
                    </span>

                    {renderFileButtons(
                      track,
                      t.normal,
                      track.preview_url,
                      track.brstm_url
                    )}

                    {renderFileButtons(
                      track,
                      t.lap3,
                      track.preview_lap3_url,
                      track.brstm_lap3_url
                    )}
                  </div>
                </article>
              ))}

              {visibleTracks.length === 0 && (
                <div className="empty">{t.empty}</div>
              )}
            </div>
          )}
        </section>
      </main>

      <footer className="footer">
        <p>© 2026 Kei BRSTM Hub · {t.footer}</p>
      </footer>
    </div>
  );
}