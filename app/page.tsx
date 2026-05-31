"use client";

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
  brstm_url: string;
  preview_url: string;
  download_count: number;
  created_at: string;
};

const translations = {
  ja: {
    subtitle:
      "Mario Kart Wii / CTGP-R 向けミュージックハックを検索・試聴・ダウンロード",
    search: "曲名・対応スロット・使用例CTで検索",
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
    search: "Search by title, slot, or example CT",
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
  const [playingId, setPlayingId] = useState<number | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const t = translations[language];

  useEffect(() => {
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

  const visibleTracks = useMemo(() => {
    const keyword = query.trim().toLowerCase();

    return [...tracks]
      .filter((track) => category === "すべて" || track.category === category)
      .filter((track) => {
        const searchableText = [
          track.title,
          track.source,
          track.slot_name,
          track.example_ct,
          track.description,
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

  async function handlePreview(track: Track) {
    if (!track.preview_url) {
      window.alert(t.noPreview);
      return;
    }

    if (playingId === track.id && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
      setPlayingId(null);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    const nextAudio = new Audio(track.preview_url);

    nextAudio.addEventListener("ended", () => {
      setPlayingId(null);
      audioRef.current = null;
    });

    nextAudio.addEventListener("error", () => {
      setPlayingId(null);
      audioRef.current = null;
      window.alert(t.previewError);
    });

    audioRef.current = nextAudio;
    setPlayingId(track.id);

    try {
      await nextAudio.play();
    } catch (error) {
      console.error("Failed to play preview:", error);
      audioRef.current = null;
      setPlayingId(null);
      window.alert(t.previewError);
    }
  }

  return (
    <div className="page">
      <header className="header">
        <div className="headerInner">
          <div className="logoArea">
            <div className="logo">♫</div>
            <span>Kei BRSTM Hub</span>
          </div>

          <div className="headerButtons">
            <button
              className="secondaryButton"
              type="button"
              onClick={() => setLanguage(language === "ja" ? "en" : "ja")}
            >
              {language === "ja" ? "EN" : "JP"}
            </button>

            <button className="primaryButton" type="button">
              {t.admin}
            </button>
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
                  <button
                    className={
                      playingId === track.id
                        ? "playButton playing"
                        : "playButton"
                    }
                    type="button"
                    aria-label={`${track.title} - ${
                      playingId === track.id ? t.stop : t.preview
                    }`}
                    onClick={() => handlePreview(track)}
                  >
                    {playingId === track.id ? "■" : "▶"}
                  </button>

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
                  </div>

                  <div className="trackActions">
                    <span className="downloadCount">
                      ↓ {track.download_count}
                    </span>

                    {track.brstm_url ? (
                      <a
                        className="downloadButton"
                        href={createDownloadUrl(track.brstm_url)}
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