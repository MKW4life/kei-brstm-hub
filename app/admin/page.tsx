"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import KeiProjectRail from "@/components/KeiProjectRail";
import AdminTagPicker from "@/components/AdminTagPicker";
import TagSearchInput, { type TagSuggestion } from "@/components/TagSearchInput";

type Track = {
  id: number;
  title: string;
  title_en: string;
  category: string;
  tags: string;
  loop_type: string;
  brstm_url: string;
  preview_url: string;
  brstm_lap3_url: string;
  preview_lap3_url: string;
  is_published: boolean;
  created_at: string;
};

type MusicPack = {
  id: number;
  title: string;
  tags: string;
  youtube_url: string;
  zip_url: string;
  is_published: boolean;
  created_at: string;
};

type BulkRole =
  | "ignore"
  | "normalBrstm"
  | "lap3Brstm"
  | "normalPreview"
  | "lap3Preview";

type BulkGroupFile = {
  id: string;
  name: string;
  extension: "brstm" | "mp3";
  role: BulkRole;
  file: File;
};

type BulkGroup = {
  key: string;
  title: string;
  titleEn: string;
  category: string;
  tags: string;
  loopType: "loop" | "no";
  isPublished: boolean;
  files: BulkGroupFile[];
  status: "ready" | "uploading" | "done" | "error" | "skipped";
};

type DuplicateMatch = {
  id: number;
  title: string;
  titleEn: string;
  score: number;
};

type DuplicateReviewItem = {
  groupKey: string;
  incomingTitle: string;
  matches: DuplicateMatch[];
};

type TagDefinition = {
  name: string;
  name_en: string;
};

const categories = ["コースBGM", "その他BGM"];
const loopTypes = [
  { value: "no", label: "No" },
  { value: "loop", label: "Loop" },
];

function safeFileName(fileName: string) {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  const baseName = fileName
    .replace(/\.[^/.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${
    baseName || "file"
  }.${extension}`;
}

function getLoopValue(loopType: string) {
  return loopType === "loop" || loopType === "perfect_loop" ? "Loop" : "No";
}

function normalizeLoopForSave(loopType: string) {
  return loopType === "loop" || loopType === "perfect_loop" ? "loop" : "no";
}


function normalizeTitleForSimilarity(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/(?:\blap\s*3\b|\bfinal\s*lap\b|\bfinal\b)/gi, " ")
    .replace(/[\s\-_–—:：!！?？'"“”‘’()（）\[\]【】{}・,.，。/\\]+/g, "")
    .trim();
}

function levenshteinDistance(a: string, b: string) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;

    for (let j = 1; j <= b.length; j += 1) {
      const oldAbove = previous[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;

      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + cost
      );

      diagonal = oldAbove;
    }
  }

  return previous[b.length];
}

function titleSimilarity(a: string, b: string) {
  const left = normalizeTitleForSimilarity(a);
  const right = normalizeTitleForSimilarity(b);

  if (!left || !right) return 0;
  if (left === right) return 1;

  const maxLength = Math.max(left.length, right.length);
  const editScore = 1 - levenshteinDistance(left, right) / maxLength;

  const shorter = left.length <= right.length ? left : right;
  const longer = left.length > right.length ? left : right;
  const containmentScore =
    shorter.length >= 7 && longer.includes(shorter)
      ? shorter.length / longer.length
      : 0;

  return Math.max(editScore, containmentScore);
}

function stripExtension(fileName: string) {
  return fileName.replace(/\.[^/.]+$/, "");
}

function cleanBaseName(value: string) {
  return value
    .replace(/[\s_.-]+$/g, "")
    .replace(/^[\s_.-]+/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Lap 3 name detection.
 *
 * Supported examples:
 * Song 3
 * Song Lap3
 * Song Lap 3
 * Song final
 * Song 3 (Game OST)
 * Song Lap3 (Game OST)
 *
 * This makes:
 * Encounter! PokéManiac (Pokémon Omega Ruby & Alpha Sapphire OST)
 * Encounter! PokéManiac 3 (Pokémon Omega Ruby & Alpha Sapphire OST)
 *
 * resolve to the same song group.
 */
function normalizeCompareName(value: string) {
  return cleanBaseName(value)
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"');
}

function removeExplicitLap3Marker(stem: string) {
  const patterns = [
    /(?:^|[\s_.-])lap[\s_-]*3(?:$|[\s_.-])/i,
    /(?:^|[\s_.-])lap3(?:$|[\s_.-])/i,
    /(?:^|[\s_.-])final[\s_-]*lap(?:$|[\s_.-])/i,
    /(?:^|[\s_.-])final(?:$|[\s_.-])/i,
  ];

  for (const pattern of patterns) {
    if (pattern.test(stem)) {
      return {
        matched: true,
        baseName: cleanBaseName(stem.replace(pattern, " ")),
      };
    }
  }

  return {
    matched: false,
    baseName: cleanBaseName(stem),
  };
}

function buildBulkGroups(files: File[]): BulkGroup[] {
  const usableFiles = files
    .map((file, index) => {
      const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
      const stem = stripExtension(file.name);

      return {
        file,
        index,
        extension,
        stem,
        normalizedStem: normalizeCompareName(stem),
      };
    })
    .filter((item) => ["brstm", "mp3"].includes(item.extension));

  const knownNames = new Set(
    usableFiles.map((item) => item.normalizedStem)
  );

  const prepared = usableFiles.map((item) => {
    // First handle explicit Lap 3 markers such as "_lap3" or " final".
    const explicit = removeExplicitLap3Marker(item.stem);

    if (explicit.matched) {
      return {
        ...item,
        isLap3: true,
        baseName: explicit.baseName,
      };
    }

    // Then try removing a standalone "3" from ANY position.
    // It is treated as Lap 3 only when the resulting name actually exists
    // among the files selected at the same time.
    //
    // Example:
    // Encounter! PokéManiac (Pokémon Omega Ruby & Alpha Sapphire OST)
    // Encounter! PokéManiac 3 (Pokémon Omega Ruby & Alpha Sapphire OST)
    //
    // Removing the standalone 3 from the second name produces the first one,
    // so they are safely grouped together.
    const standaloneThreePattern = /(^|[\s_.-])3(?=$|[\s_.-]|\(|（|\[|【)/g;

    const candidates: string[] = [];
    let match: RegExpExecArray | null;

    while ((match = standaloneThreePattern.exec(item.stem)) !== null) {
      const start = match.index;
      const fullMatch = match[0];
      const prefixLength = match[1]?.length ?? 0;
      const threeIndex = start + prefixLength;

      const candidate = cleanBaseName(
        item.stem.slice(0, threeIndex) + item.stem.slice(threeIndex + 1)
      );

      candidates.push(candidate);

      if (fullMatch.length === 0) {
        standaloneThreePattern.lastIndex += 1;
      }
    }

    // Also handle names where the Lap 3 marker is attached directly
    // to the very end with no separator.
    //
    // Example:
    // t+pazolite Oshama Scramble! (Uncut Edition)
    // t+pazolite Oshama Scramble! (Uncut Edition)3
    //
    // As with standalone "3", this is treated as Lap 3 ONLY when
    // removing the final 3 produces another selected filename.
    if (item.stem.endsWith("3")) {
      const attachedTrailingThreeCandidate = cleanBaseName(
        item.stem.slice(0, -1)
      );

      if (attachedTrailingThreeCandidate) {
        candidates.push(attachedTrailingThreeCandidate);
      }
    }

    const matchingCandidate = candidates.find((candidate) =>
      knownNames.has(normalizeCompareName(candidate))
    );

    if (matchingCandidate) {
      return {
        ...item,
        isLap3: true,
        baseName: matchingCandidate,
      };
    }

    return {
      ...item,
      isLap3: false,
      baseName: cleanBaseName(item.stem),
    };
  });

  const map = new Map<string, BulkGroup>();

  for (const item of prepared) {
    const key = normalizeCompareName(item.baseName);

    const existing =
      map.get(key) ||
      ({
        key,
        title: item.baseName,
        titleEn: "",
        category: "コースBGM",
        tags: "No tag",
        loopType: "no",
        isPublished: true,
        files: [],
        status: "ready",
      } satisfies BulkGroup);

    const role: BulkRole =
      item.extension === "brstm"
        ? item.isLap3
          ? "lap3Brstm"
          : "normalBrstm"
        : item.isLap3
        ? "lap3Preview"
        : "normalPreview";

    existing.files.push({
      id: `${key}-${item.index}-${item.file.name}`,
      name: item.file.name,
      extension: item.extension as "brstm" | "mp3",
      role,
      file: item.file,
    });

    map.set(key, existing);
  }

  return Array.from(map.values()).sort((a, b) => a.title.localeCompare(b.title));
}

function getStoragePathFromPublicUrl(bucket: string, publicUrl: string) {
  if (!publicUrl) return null;

  try {
    const marker = `/storage/v1/object/public/${bucket}/`;
    const markerIndex = publicUrl.indexOf(marker);
    if (markerIndex === -1) return null;

    const pathWithQuery = publicUrl.slice(markerIndex + marker.length);
    return decodeURIComponent(pathWithQuery.split("?")[0]);
  } catch {
    return null;
  }
}

export default function AdminPage() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [packs, setPacks] = useState<MusicPack[]>([]);
  const [message, setMessage] = useState("");
  const [bulkGroups, setBulkGroups] = useState<BulkGroup[]>([]);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [editingTrackId, setEditingTrackId] = useState<number | null>(null);

  const [editTitle, setEditTitle] = useState("");
  const [editTitleEn, setEditTitleEn] = useState("");
  const [editCategory, setEditCategory] = useState("コースBGM");
  const [editLoopType, setEditLoopType] = useState<"loop" | "no">("no");
  const [editTags, setEditTags] = useState("No tag");
  const [editIsPublished, setEditIsPublished] = useState(true);

  const [editBrstmFile, setEditBrstmFile] = useState<File | null>(null);
  const [editPreviewFile, setEditPreviewFile] = useState<File | null>(null);
  const [editBrstmLap3File, setEditBrstmLap3File] = useState<File | null>(null);
  const [editPreviewLap3File, setEditPreviewLap3File] =
    useState<File | null>(null);

  const [packTitle, setPackTitle] = useState("");
  const [packTags, setPackTags] = useState("No tag");
  const [packYoutubeUrl, setPackYoutubeUrl] = useState("");
  const [packZipUrl, setPackZipUrl] = useState("");
  const [packPublished, setPackPublished] = useState(true);
  const [packSubmitting, setPackSubmitting] = useState(false);
  const [tagDrafts, setTagDrafts] = useState<Record<string, string>>({});
  const [tagEnglishDrafts, setTagEnglishDrafts] = useState<Record<string, string>>({});
  const [tagDefinitions, setTagDefinitions] = useState<TagDefinition[]>([]);
  const [adminPlayingKey, setAdminPlayingKey] = useState<string | null>(null);
  const adminAudioRef = useRef<HTMLAudioElement | null>(null);
  const [duplicateReview, setDuplicateReview] = useState<DuplicateReviewItem[]>([]);
  const [showDuplicateReview, setShowDuplicateReview] = useState(false);
  const [duplicateSkippedGroupKeys, setDuplicateSkippedGroupKeys] = useState<string[]>([]);
  const [adminTrackQuery, setAdminTrackQuery] = useState("");
  const [adminTrackTagQuery, setAdminTrackTagQuery] = useState("");
  const [adminTrackTagMode, setAdminTrackTagMode] = useState<"all" | "any">("all");
  const [bulkTagName, setBulkTagName] = useState("");
  const [bulkTagTrackQuery, setBulkTagTrackQuery] = useState("");
  const [bulkTagFilterQuery, setBulkTagFilterQuery] = useState("");
  const [bulkTagFilterMode, setBulkTagFilterMode] = useState<"all" | "any">("all");
  const [bulkTagSelectedTrackIds, setBulkTagSelectedTrackIds] = useState<number[]>([]);
  const [bulkTagApplying, setBulkTagApplying] = useState(false);
  const [pendingUploadGroupKeys, setPendingUploadGroupKeys] = useState<string[]>([]);
  const [hideCompletedBulkGroups, setHideCompletedBulkGroups] = useState(true);

  const tagSuggestions = useMemo(() => {
    const allTags = [
      ...tracks.flatMap((track) =>
        (track.tags || "")
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean)
      ),
      ...packs.flatMap((pack) =>
        (pack.tags || "")
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean)
      ),
    ];

    const uniqueTags = new Map<string, string>();

    for (const tag of allTags) {
      const normalized = tag.toLowerCase();
      if (!uniqueTags.has(normalized)) {
        uniqueTags.set(normalized, tag);
      }
    }

    return Array.from(uniqueTags.values()).sort((a, b) =>
      a.localeCompare(b)
    );
  }, [tracks, packs]);

  const tagSearchSuggestions = useMemo<TagSuggestion[]>(() => {
    const definitionMap = new Map(
      tagDefinitions.map((definition) => [
        definition.name.toLowerCase(),
        definition.name_en || "",
      ])
    );

    return tagSuggestions.map((name) => ({
      name,
      name_en: definitionMap.get(name.toLowerCase()) || "",
    }));
  }, [tagSuggestions, tagDefinitions]);

  const tagAliasMap = useMemo(() => {
    const map = new Map<string, string>();

    for (const suggestion of tagSearchSuggestions) {
      const canonical = suggestion.name.toLowerCase();
      map.set(canonical, canonical);

      const english = suggestion.name_en?.trim().toLowerCase();
      if (english) map.set(english, canonical);
    }

    return map;
  }, [tagSearchSuggestions]);

  const tagPickerSuggestions = useMemo(() => {
    const counts = new Map<string, { label: string; count: number }>();

    const addTags = (value: string) => {
      for (const tag of splitTagList(value)) {
        const normalized = tag.toLowerCase();
        const current = counts.get(normalized);

        if (current) {
          current.count += 1;
        } else {
          counts.set(normalized, { label: tag, count: 1 });
        }
      }
    };

    tracks.forEach((track) => addTags(track.tags || ""));
    packs.forEach((pack) => addTags(pack.tags || ""));

    return Array.from(counts.values())
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
      .map((item) => item.label);
  }, [tracks, packs]);

  const adminTrackMatches = useMemo(() => {
    const keyword = adminTrackQuery
      .trim()
      .toLowerCase()
      .replace(/^#/, "");

    return tracks
      .filter((track) => {
        if (!keyword) return true;

        return [
          track.title,
          track.title_en,
          track.category,
          track.tags,
          getLoopValue(track.loop_type),
        ]
          .join(" ")
          .toLowerCase()
          .includes(keyword);
      })
      .filter((track) =>
        matchesTagSearch(track.tags, adminTrackTagQuery, adminTrackTagMode)
      );
  }, [tracks, adminTrackQuery, adminTrackTagQuery, adminTrackTagMode, tagAliasMap]);

  const hasAdminTrackFilter =
    Boolean(adminTrackQuery.trim()) || Boolean(adminTrackTagQuery.trim());

  const visibleAdminTracks = hasAdminTrackFilter
    ? adminTrackMatches.slice(0, 50)
    : tracks.slice(0, 8);

  const bulkTagTrackMatches = useMemo(() => {
    const keyword = bulkTagTrackQuery
      .trim()
      .toLowerCase()
      .replace(/^#/, "");

    const hasFilter =
      Boolean(keyword) || Boolean(bulkTagFilterQuery.trim());

    if (!hasFilter) return [];

    return tracks
      .filter((track) => {
        if (!keyword) return true;

        return [
          track.title,
          track.title_en,
          track.category,
          track.tags,
        ]
          .join(" ")
          .toLowerCase()
          .includes(keyword);
      })
      .filter((track) =>
        matchesTagSearch(track.tags, bulkTagFilterQuery, bulkTagFilterMode)
      );
  }, [
    tracks,
    bulkTagTrackQuery,
    bulkTagFilterQuery,
    bulkTagFilterMode,
    tagAliasMap,
  ]);

  const completedBulkGroupCount = bulkGroups.filter(
    (group) => group.status === "done"
  ).length;

  const visibleBulkGroups = hideCompletedBulkGroups
    ? bulkGroups.filter((group) => group.status !== "done")
    : bulkGroups;

  useEffect(() => {
    async function checkLogin() {
      const { data } = await supabase.auth.getUser();

      if (!data.user) {
        router.push("/admin/login");
        return;
      }

      setChecking(false);
      await Promise.all([loadTracks(), loadPacks(), loadTagDefinitions()]);
    }

    checkLogin();
  }, [router]);

  useEffect(() => {
    return () => {
      if (adminAudioRef.current) {
        adminAudioRef.current.pause();
        adminAudioRef.current = null;
      }
    };
  }, []);

  async function handleAdminPreview(
    track: Track,
    previewUrl: string,
    variant: "normal" | "lap3"
  ) {
    if (!previewUrl) {
      setMessage(
        variant === "normal"
          ? "通常プレビューMP3が登録されていません。"
          : "Lap 3プレビューMP3が登録されていません。"
      );
      return;
    }

    const key = `${track.id}-${variant}`;

    if (adminPlayingKey === key && adminAudioRef.current) {
      adminAudioRef.current.pause();
      adminAudioRef.current.currentTime = 0;
      adminAudioRef.current = null;
      setAdminPlayingKey(null);
      return;
    }

    if (adminAudioRef.current) {
      adminAudioRef.current.pause();
      adminAudioRef.current.currentTime = 0;
    }

    const audio = new Audio(previewUrl);
    const savedVolume = Number(
      window.localStorage.getItem("kei-brstm-hub-volume") ?? "0.5"
    );

    audio.volume = Number.isFinite(savedVolume)
      ? Math.min(0.5, Math.max(0, savedVolume))
      : 0.5;

    audio.addEventListener("ended", () => {
      adminAudioRef.current = null;
      setAdminPlayingKey(null);
    });

    audio.addEventListener("error", () => {
      adminAudioRef.current = null;
      setAdminPlayingKey(null);
      setMessage("プレビューを再生できませんでした。");
    });

    adminAudioRef.current = audio;
    setAdminPlayingKey(key);

    try {
      await audio.play();
    } catch (error) {
      console.error(error);
      adminAudioRef.current = null;
      setAdminPlayingKey(null);
      setMessage("プレビューを再生できませんでした。");
    }
  }

  async function loadTracks() {
    const { data, error } = await supabase
      .from("tracks")
      .select(
        `
        id,
        title,
        title_en,
        category,
        tags,
        loop_type,
        brstm_url,
        preview_url,
        brstm_lap3_url,
        preview_lap3_url,
        is_published,
        created_at
      `
      )
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      setMessage("曲一覧を読み込めませんでした。");
      return;
    }

    const rawTracks = (data as Track[]) ?? [];
    const loadedTracks = rawTracks.map((track) => ({
      ...track,
      tags: track.tags?.trim() || "No tag",
    }));

    const blankIds = rawTracks
      .filter((track) => !track.tags?.trim())
      .map((track) => track.id);

    setTracks(loadedTracks);

    if (blankIds.length > 0) {
      const { error: tagError } = await supabase
        .from("tracks")
        .update({ tags: "No tag" })
        .in("id", blankIds);

      if (tagError) {
        console.warn("No tagの自動付与に失敗しました。", tagError);
      }
    }
  }

  async function loadPacks() {
    const { data, error } = await supabase
      .from("music_packs")
      .select(
        `
        id,
        title,
        tags,
        youtube_url,
        zip_url,
        is_published,
        created_at
      `
      )
      .order("created_at", { ascending: false });

    if (error) {
      console.warn(error);
      return;
    }

    const rawPacks = (data as MusicPack[]) ?? [];
    const loadedPacks = rawPacks.map((pack) => ({
      ...pack,
      tags: pack.tags?.trim() || "No tag",
    }));

    const blankIds = rawPacks
      .filter((pack) => !pack.tags?.trim())
      .map((pack) => pack.id);

    setPacks(loadedPacks);

    if (blankIds.length > 0) {
      const { error: tagError } = await supabase
        .from("music_packs")
        .update({ tags: "No tag" })
        .in("id", blankIds);

      if (tagError) {
        console.warn("Music PackへのNo tag自動付与に失敗しました。", tagError);
      }
    }
  }

  async function loadTagDefinitions() {
    const { data, error } = await supabase
      .from("tag_definitions")
      .select("name, name_en")
      .order("name", { ascending: true });

    if (error) {
      console.warn("タグ英語名を読み込めませんでした。", error);
      setTagDefinitions([]);
      return;
    }

    const definitions = (data as TagDefinition[]) ?? [];
    setTagDefinitions(definitions);
    setTagEnglishDrafts(
      Object.fromEntries(
        definitions.map((definition) => [
          definition.name,
          definition.name_en || "",
        ])
      )
    );
  }

  async function getAdminAccessToken() {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error || !session?.access_token) {
      throw new Error("管理者セッションを取得できませんでした。再ログインしてください。");
    }

    return session.access_token;
  }

  function getR2ObjectKey(bucket: string, publicUrl: string) {
    if (!publicUrl) return null;

    try {
      const parsed = new URL(publicUrl);
      const key = decodeURIComponent(parsed.pathname).replace(/^\/+/, "");

      if (!key.startsWith(`${bucket}/`)) return null;
      return key;
    } catch {
      return null;
    }
  }

  async function uploadFile(bucket: string, file: File) {
    const filePath = safeFileName(file.name);
    const key = `${bucket}/${filePath}`;
    const contentType =
      file.type ||
      (file.name.toLowerCase().endsWith(".mp3")
        ? "audio/mpeg"
        : "application/octet-stream");

    const accessToken = await getAdminAccessToken();

    const signResponse = await fetch("/api/r2/upload-url", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        key,
        contentType,
      }),
    });

    const signData = await signResponse.json().catch(() => null);

    if (!signResponse.ok || !signData?.uploadUrl || !signData?.publicUrl) {
      throw new Error(
        signData?.error || "R2アップロードURLの発行に失敗しました。"
      );
    }

    const uploadResponse = await fetch(signData.uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": contentType,
      },
      body: file,
    });

    if (!uploadResponse.ok) {
      throw new Error(
        `R2へのアップロードに失敗しました (${uploadResponse.status})`
      );
    }

    return signData.publicUrl as string;
  }

  async function removeStorageFile(bucket: string, publicUrl: string) {
    if (!publicUrl) return;

    // New files: Cloudflare R2
    const r2Key = getR2ObjectKey(bucket, publicUrl);

    if (r2Key) {
      try {
        const accessToken = await getAdminAccessToken();

        const response = await fetch("/api/r2/delete", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ key: r2Key }),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => null);
          console.warn(
            `R2 file delete failed: ${r2Key}`,
            data?.error || response.status
          );
        }
      } catch (error) {
        console.warn(`R2 file delete failed: ${r2Key}`, error);
      }

      return;
    }

    // Legacy fallback: files that still point at Supabase Storage.
    const filePath = getStoragePathFromPublicUrl(bucket, publicUrl);
    if (!filePath) return;

    const { error } = await supabase.storage.from(bucket).remove([filePath]);

    if (error) {
      console.warn(
        `Legacy Supabase Storage file delete failed: ${bucket}/${filePath}`,
        error
      );
    }
  }

  function handleBulkFiles(files: FileList | null) {
    if (!files) return;

    const groups = buildBulkGroups(Array.from(files));
    setBulkGroups(groups);
    setDuplicateSkippedGroupKeys([]);
    setShowDuplicateReview(false);

    if (groups.length === 0) {
      setMessage("BRSTMまたはMP3ファイルを選択してください。");
      return;
    }

    setMessage(
      `${groups.length}曲を自動判別しました。必要なら「所属曲」と「役割」を手動で修正してください。`
    );
  }

  function updateBulkGroup(
    key: string,
    patch: Partial<Omit<BulkGroup, "key" | "files">>
  ) {
    setBulkGroups((current) =>
      current.map((group) =>
        group.key === key ? { ...group, ...patch } : group
      )
    );
  }

  function updateBulkFileRole(
    groupKey: string,
    fileId: string,
    role: BulkRole
  ) {
    setBulkGroups((current) =>
      current.map((group) =>
        group.key !== groupKey
          ? group
          : {
              ...group,
              files: group.files.map((item) =>
                item.id === fileId ? { ...item, role } : item
              ),
            }
      )
    );
  }

  function moveBulkFile(
    sourceGroupKey: string,
    fileId: string,
    targetGroupKey: string
  ) {
    if (sourceGroupKey === targetGroupKey) return;

    setBulkGroups((current) => {
      const source = current.find((group) => group.key === sourceGroupKey);
      const target = current.find((group) => group.key === targetGroupKey);

      if (!source || !target) return current;

      const movingFile = source.files.find((item) => item.id === fileId);
      if (!movingFile) return current;

      const next = current
        .map((group) => {
          if (group.key === sourceGroupKey) {
            return {
              ...group,
              files: group.files.filter((item) => item.id !== fileId),
            };
          }

          if (group.key === targetGroupKey) {
            const movedRole: BulkRole =
              movingFile.extension === "brstm"
                ? "lap3Brstm"
                : "lap3Preview";

            return {
              ...group,
              files: [
                ...group.files,
                {
                  ...movingFile,
                  role: movedRole,
                },
              ],
            };
          }

          return group;
        })
        .filter((group) => group.files.length > 0);

      return next;
    });
  }

  function splitBulkFile(sourceGroupKey: string, fileId: string) {
    setBulkGroups((current) => {
      const source = current.find((group) => group.key === sourceGroupKey);
      if (!source) return current;

      const selected = source.files.find((item) => item.id === fileId);
      if (!selected) return current;

      const selectedStem = normalizeCompareName(stripExtension(selected.name));
      const filesToSplit = source.files.filter(
        (item) =>
          normalizeCompareName(stripExtension(item.name)) === selectedStem
      );

      if (filesToSplit.length === 0) return current;

      const splitIds = new Set(filesToSplit.map((item) => item.id));
      const splitTitle = cleanBaseName(stripExtension(selected.name));
      const splitKey = `${normalizeCompareName(splitTitle)}-split-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 6)}`;

      const newGroup: BulkGroup = {
        key: splitKey,
        title: splitTitle,
        titleEn: "",
        category: source.category,
        tags: normalizeTagsForSave(source.tags),
        loopType: "no",
        isPublished: source.isPublished,
        files: filesToSplit.map((item) => ({
          ...item,
          role:
            item.extension === "brstm"
              ? "normalBrstm"
              : "normalPreview",
        })),
        status: "ready",
      };

      const nextSource: BulkGroup = {
        ...source,
        files: source.files.filter((item) => !splitIds.has(item.id)),
        status: "ready",
      };

      return [
        ...current.filter((group) => group.key !== sourceGroupKey),
        ...(nextSource.files.length > 0 ? [nextSource] : []),
        newGroup,
      ].sort((a, b) => a.title.localeCompare(b.title));
    });
  }

  function splitTagList(value: string) {
    return (value || "")
      .split(",")
      .map((item) => item.trim().replace(/^#/, ""))
      .filter(Boolean);
  }

  function normalizeTagsForSave(value: string) {
    const result: string[] = [];
    const seen = new Set<string>();

    for (const tag of splitTagList(value)) {
      const normalized = tag.toLowerCase();

      if (!seen.has(normalized)) {
        seen.add(normalized);
        result.push(tag);
      }
    }

    const realTags = result.filter((tag) => tag.toLowerCase() !== "no tag");
    return realTags.length > 0 ? realTags.join(", ") : "No tag";
  }

  function parseTagSearch(value: string) {
    const seen = new Set<string>();

    return splitTagList(value)
      .map((tag) => tag.toLowerCase())
      .map((tag) => tagAliasMap.get(tag) ?? tag)
      .filter((tag) => {
        if (seen.has(tag)) return false;
        seen.add(tag);
        return true;
      });
  }

  function matchesTagSearch(
    tagsValue: string,
    searchValue: string,
    mode: "all" | "any"
  ) {
    const requested = parseTagSearch(searchValue);
    if (requested.length === 0) return true;

    const trackTags = new Set(
      splitTagList(tagsValue).map((tag) => tag.toLowerCase())
    );

    return mode === "all"
      ? requested.every((tag) => trackTags.has(tag))
      : requested.some((tag) => trackTags.has(tag));
  }

  function buildRenamedTagList(
    value: string,
    oldTag: string,
    newTag: string | null
  ) {
    const oldNormalized = oldTag.toLowerCase();
    const result: string[] = [];
    const seen = new Set<string>();

    for (const tag of splitTagList(value)) {
      let nextTag = tag;

      if (tag.toLowerCase() === oldNormalized) {
        if (newTag === null) {
          continue;
        }

        nextTag = newTag;
      }

      const normalized = nextTag.toLowerCase();

      if (!seen.has(normalized)) {
        seen.add(normalized);
        result.push(nextTag);
      }
    }

    return normalizeTagsForSave(result.join(", "));
  }

  async function updateTagEverywhere(oldTag: string, newTag: string | null) {
    const affectedTracks = tracks.filter((track) =>
      splitTagList(track.tags).some(
        (tag) => tag.toLowerCase() === oldTag.toLowerCase()
      )
    );

    const affectedPacks = packs.filter((pack) =>
      splitTagList(pack.tags).some(
        (tag) => tag.toLowerCase() === oldTag.toLowerCase()
      )
    );

    for (const track of affectedTracks) {
      const nextTags = buildRenamedTagList(track.tags, oldTag, newTag);

      const { error } = await supabase
        .from("tracks")
        .update({ tags: nextTags })
        .eq("id", track.id);

      if (error) {
        throw error;
      }
    }

    for (const pack of affectedPacks) {
      const nextTags = buildRenamedTagList(pack.tags, oldTag, newTag);

      const { error } = await supabase
        .from("music_packs")
        .update({ tags: nextTags })
        .eq("id", pack.id);

      if (error) {
        throw error;
      }
    }
  }

  async function handleSaveTagEnglish(tag: string) {
    const nameEn = (tagEnglishDrafts[tag] ?? "").trim();

    try {
      const { error } = await supabase
        .from("tag_definitions")
        .upsert(
          {
            name: tag,
            name_en: nameEn,
          },
          { onConflict: "name" }
        );

      if (error) throw error;

      setMessage(
        nameEn
          ? `#${tag} の英語名を「${nameEn}」に保存しました。`
          : `#${tag} の英語名を空欄にしました。英語表示では日本語名を使用します。`
      );
      await loadTagDefinitions();
    } catch (error) {
      console.error(error);
      setMessage("タグ英語名の保存に失敗しました。tag_definitionsテーブルを確認してください。");
    }
  }

  async function handleRenameTag(oldTag: string) {
    const newTag = (tagDrafts[oldTag] ?? oldTag).trim();

    if (!newTag) {
      setMessage("新しいタグ名を入力してください。");
      return;
    }

    if (newTag.toLowerCase() === oldTag.toLowerCase()) {
      setMessage("タグ名は変更されていません。");
      return;
    }

    try {
      setMessage(`#${oldTag} を #${newTag} に変更中...`);

      await updateTagEverywhere(oldTag, newTag);

      const currentEnglish =
        tagEnglishDrafts[oldTag] ??
        tagDefinitions.find(
          (definition) => definition.name.toLowerCase() === oldTag.toLowerCase()
        )?.name_en ??
        "";

      await supabase.from("tag_definitions").delete().eq("name", oldTag);
      const { error: definitionError } = await supabase
        .from("tag_definitions")
        .upsert(
          {
            name: newTag,
            name_en: currentEnglish.trim(),
          },
          { onConflict: "name" }
        );

      if (definitionError) throw definitionError;

      setTagDrafts((current) => {
        const next = { ...current };
        delete next[oldTag];
        return next;
      });

      setTagEnglishDrafts((current) => {
        const next = { ...current };
        delete next[oldTag];
        next[newTag] = currentEnglish;
        return next;
      });

      setMessage(`#${oldTag} を #${newTag} に変更しました。`);
      await Promise.all([loadTracks(), loadPacks(), loadTagDefinitions()]);
    } catch (error) {
      console.error(error);
      setMessage("タグ名の変更に失敗しました。");
    }
  }

  async function handleDeleteTag(tag: string) {
    const ok = window.confirm(
      `#${tag} をすべての曲・Music Packから削除しますか？`
    );

    if (!ok) return;

    try {
      setMessage(`#${tag} を削除中...`);

      await updateTagEverywhere(tag, null);
      await supabase.from("tag_definitions").delete().eq("name", tag);

      setTagDrafts((current) => {
        const next = { ...current };
        delete next[tag];
        return next;
      });

      setTagEnglishDrafts((current) => {
        const next = { ...current };
        delete next[tag];
        return next;
      });

      setMessage(`#${tag} をすべての登録から削除しました。`);
      await Promise.all([loadTracks(), loadPacks(), loadTagDefinitions()]);
    } catch (error) {
      console.error(error);
      setMessage("タグの削除に失敗しました。");
    }
  }

  function toggleBulkTagTrackSelection(trackId: number) {
    setBulkTagSelectedTrackIds((current) =>
      current.includes(trackId)
        ? current.filter((id) => id !== trackId)
        : [...current, trackId]
    );
  }

  function selectAllBulkTagMatches() {
    setBulkTagSelectedTrackIds((current) => {
      const next = new Set(current);
      bulkTagTrackMatches.forEach((track) => next.add(track.id));
      return Array.from(next);
    });
  }

  async function handleBulkAddTag() {
    const tag = bulkTagName.trim().replace(/^#/, "");

    if (!tag) {
      setMessage("一括付与するタグ名を入力してください。");
      return;
    }

    if (bulkTagSelectedTrackIds.length === 0) {
      setMessage("タグを追加する曲を選択してください。");
      return;
    }

    const selectedTracks = tracks.filter((track) =>
      bulkTagSelectedTrackIds.includes(track.id)
    );

    setBulkTagApplying(true);
    setMessage(`#${tag} を ${selectedTracks.length}曲に追加中...`);

    try {
      const results = await Promise.all(
        selectedTracks.map(async (track) => {
          const existingTags = splitTagList(track.tags);

          if (
            existingTags.some(
              (existingTag) =>
                existingTag.toLowerCase() === tag.toLowerCase()
            )
          ) {
            return false;
          }

          const nextTags = normalizeTagsForSave([...existingTags, tag].join(", "));

          const { error } = await supabase
            .from("tracks")
            .update({ tags: nextTags })
            .eq("id", track.id);

          if (error) throw error;
          return true;
        })
      );

      const changedCount = results.filter(Boolean).length;

      setMessage(
        `#${tag} を ${changedCount}曲に追加しました。` +
          (changedCount < selectedTracks.length
            ? ` ${selectedTracks.length - changedCount}曲は既に付いていました。`
            : "")
      );
      setBulkTagSelectedTrackIds([]);
      await loadTracks();
    } catch (error) {
      console.error(error);
      setMessage("タグの一括付与に失敗しました。");
    } finally {
      setBulkTagApplying(false);
    }
  }

  function addSuggestedTagToGroup(key: string, tag: string) {
    setBulkGroups((current) =>
      current.map((group) => {
        if (group.key !== key) return group;

        const existing = group.tags
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);

        if (existing.some((item) => item.toLowerCase() === tag.toLowerCase())) {
          return group;
        }

        return { ...group, tags: [...existing, tag].join(", ") };
      })
    );
  }

  function getRoleLabel(role: BulkRole) {
    switch (role) {
      case "normalBrstm":
        return "通常BRSTM";
      case "lap3Brstm":
        return "Lap 3 BRSTM";
      case "normalPreview":
        return "通常MP3";
      case "lap3Preview":
        return "Lap 3 MP3";
      default:
        return "アップロードしない";
    }
  }

  function findPublishedDuplicateCandidates(groups: BulkGroup[]) {
    const publishedTracks = tracks.filter((track) => track.is_published);
    const reviewItems: DuplicateReviewItem[] = [];

    for (const group of groups) {
      const incomingNames = [group.title, group.titleEn]
        .map((value) => value.trim())
        .filter(Boolean);

      const matches = publishedTracks
        .map((track) => {
          const existingNames = [track.title, track.title_en]
            .map((value) => (value || "").trim())
            .filter(Boolean);

          let bestScore = 0;

          for (const incomingName of incomingNames) {
            for (const existingName of existingNames) {
              bestScore = Math.max(
                bestScore,
                titleSimilarity(incomingName, existingName)
              );
            }
          }

          return {
            id: track.id,
            title: track.title,
            titleEn: track.title_en || track.title,
            score: bestScore,
          };
        })
        .filter((match) => match.score >= 0.82)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

      if (matches.length > 0) {
        reviewItems.push({
          groupKey: group.key,
          incomingTitle: group.title,
          matches,
        });
      }
    }

    return reviewItems;
  }

  async function executeBulkUpload(
    skippedGroupKeys: Set<string> = new Set(),
    targetGroupKeys: Set<string> | null = null
  ) {
    skippedGroupKeys.forEach((key) =>
      updateBulkGroup(key, { status: "skipped" })
    );

    const validGroups = bulkGroups.filter(
      (group) =>
        group.status !== "done" &&
        !skippedGroupKeys.has(group.key) &&
        (!targetGroupKeys || targetGroupKeys.has(group.key)) &&
        group.files.some((item) => item.role === "normalBrstm")
    );

    if (validGroups.length === 0) {
      setMessage(
        skippedGroupKeys.size > 0
          ? "対象曲をすべて「アップロードしない」にしました。"
          : "通常用BRSTMがある未アップロード曲がありません。"
      );
      return;
    }

    setBulkUploading(true);
    setMessage(
      validGroups.length === 1
        ? `${validGroups[0].title} をアップロード中...`
        : `${validGroups.length}曲のアップロードを開始しました。`
    );

    let successCount = 0;
    let errorCount = 0;

    for (const group of validGroups) {
      updateBulkGroup(group.key, { status: "uploading" });

      try {
        const normalBrstmFile =
          group.files.find((item) => item.role === "normalBrstm")?.file ?? null;
        const lap3BrstmFile =
          group.files.find((item) => item.role === "lap3Brstm")?.file ?? null;
        const normalPreviewFile =
          group.files.find((item) => item.role === "normalPreview")?.file ?? null;
        const lap3PreviewFile =
          group.files.find((item) => item.role === "lap3Preview")?.file ?? null;

        if (!normalBrstmFile) {
          throw new Error("normal brstm missing");
        }

        const brstmUrl = await uploadFile("brstm-files", normalBrstmFile);
        const previewUrl = normalPreviewFile
          ? await uploadFile("previews", normalPreviewFile)
          : "";
        const brstmLap3Url = lap3BrstmFile
          ? await uploadFile("brstm-files", lap3BrstmFile)
          : "";
        const previewLap3Url = lap3PreviewFile
          ? await uploadFile("previews", lap3PreviewFile)
          : "";

        const { error } = await supabase.from("tracks").insert({
          title: group.title.trim(),
          title_en: group.titleEn.trim(),
          source: "",
          category: group.category,
          slot_name: "",
          example_ct: "",
          loop_type: group.loopType,
          description: "",
          tags: normalizeTagsForSave(group.tags),
          brstm_url: brstmUrl,
          preview_url: previewUrl,
          brstm_lap3_url: brstmLap3Url,
          preview_lap3_url: previewLap3Url,
          is_published: group.isPublished,
        });

        if (error) throw error;

        successCount += 1;
        updateBulkGroup(group.key, { status: "done" });
      } catch (error) {
        console.error(`Bulk upload failed: ${group.title}`, error);
        errorCount += 1;
        updateBulkGroup(group.key, { status: "error" });
      }
    }

    setBulkUploading(false);
    setMessage(
      `登録完了: ${successCount}曲 / 除外: ${skippedGroupKeys.size}曲 / エラー: ${errorCount}曲。`
    );
    await loadTracks();
  }

  async function prepareGroupUpload(groups: BulkGroup[]) {
    if (bulkUploading) return;

    const validGroups = groups.filter(
      (group) =>
        group.status !== "done" &&
        group.files.some((item) => item.role === "normalBrstm")
    );

    if (validGroups.length === 0) {
      setMessage("通常用BRSTMがある未アップロード曲がありません。");
      return;
    }

    const keys = validGroups.map((group) => group.key);
    setPendingUploadGroupKeys(keys);

    const duplicates = findPublishedDuplicateCandidates(validGroups);

    if (duplicates.length > 0) {
      setDuplicateReview(duplicates);
      setDuplicateSkippedGroupKeys([]);
      setShowDuplicateReview(true);
      return;
    }

    await executeBulkUpload(new Set(), new Set(keys));
    setPendingUploadGroupKeys([]);
  }

  async function handleBulkUpload() {
    await prepareGroupUpload(bulkGroups);
  }

  async function handleSingleGroupUpload(groupKey: string) {
    const group = bulkGroups.find((item) => item.key === groupKey);
    if (!group) return;

    await prepareGroupUpload([group]);
  }

  async function handleConfirmDuplicateUpload() {
    const skipped = new Set<string>(duplicateSkippedGroupKeys);
    const targets = new Set<string>(pendingUploadGroupKeys);

    setShowDuplicateReview(false);
    await executeBulkUpload(skipped, targets);
    setPendingUploadGroupKeys([]);
  }

  async function handlePackSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!packTitle.trim()) {
      setMessage("ZIPパック名を入力してください。");
      return;
    }

    if (!packZipUrl.trim()) {
      setMessage("ZIP URLを入力してください。");
      return;
    }

    try {
      new URL(packZipUrl.trim());
    } catch {
      setMessage("ZIP URLの形式が正しくありません。");
      return;
    }

    setPackSubmitting(true);
    setMessage("");

    try {
      const { error } = await supabase.from("music_packs").insert({
        title: packTitle.trim(),
        tags: normalizeTagsForSave(packTags),
        youtube_url: packYoutubeUrl.trim(),
        zip_url: packZipUrl.trim(),
        is_published: packPublished,
      });

      if (error) throw error;

      setPackTitle("");
      setPackTags("No tag");
      setPackYoutubeUrl("");
      setPackZipUrl("");
      setPackPublished(true);

      setMessage("ZIPパックを追加しました。");
      await loadPacks();
    } catch (error) {
      console.error(error);
      setMessage(
        "ZIPパックの追加に失敗しました。music_packsテーブルの設定を確認してください。"
      );
    }

    setPackSubmitting(false);
  }

  async function handlePackTogglePublish(pack: MusicPack) {
    const { error } = await supabase
      .from("music_packs")
      .update({ is_published: !pack.is_published })
      .eq("id", pack.id);

    if (error) {
      console.error(error);
      setMessage("ZIPパックの公開状態変更に失敗しました。");
      return;
    }

    await loadPacks();
  }

  async function handlePackDelete(pack: MusicPack) {
    const ok = window.confirm(
      `${pack.title} を一覧から削除しますか？\n外部のZIPファイル自体は削除されません。`
    );

    if (!ok) return;

    const { error } = await supabase
      .from("music_packs")
      .delete()
      .eq("id", pack.id);

    if (error) {
      console.error(error);
      setMessage("ZIPパックの削除に失敗しました。");
      return;
    }

    setMessage("ZIPパックを一覧から削除しました。");
    await loadPacks();
  }

  function startEdit(track: Track) {
    setMessage("");
    setEditingTrackId(track.id);
    setEditTitle(track.title ?? "");
    setEditTitleEn(track.title_en || track.title || "");
    setEditCategory(track.category ?? "コースBGM");
    setEditLoopType(normalizeLoopForSave(track.loop_type) as "loop" | "no");
    setEditTags(track.tags?.trim() || "No tag");
    setEditIsPublished(track.is_published);
    setEditBrstmFile(null);
    setEditPreviewFile(null);
    setEditBrstmLap3File(null);
    setEditPreviewLap3File(null);
  }

  function cancelEdit() {
    setEditingTrackId(null);
    setEditBrstmFile(null);
    setEditPreviewFile(null);
    setEditBrstmLap3File(null);
    setEditPreviewLap3File(null);
  }

  async function handleEditSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (editingTrackId === null) return;

    const currentTrack = tracks.find((track) => track.id === editingTrackId);
    if (!currentTrack) return;

    setMessage("保存中...");

    try {
      const updateData: Record<string, string | boolean> = {
        title: editTitle.trim(),
        title_en: editTitleEn.trim(),
        source: "",
        category: editCategory,
        slot_name: "",
        example_ct: "",
        loop_type: editLoopType,
        description: "",
        tags: normalizeTagsForSave(editTags),
        is_published: editIsPublished,
      };

      const oldFilesToDelete: Array<[string, string]> = [];

      if (editBrstmFile) {
        updateData.brstm_url = await uploadFile("brstm-files", editBrstmFile);
        if (currentTrack.brstm_url) {
          oldFilesToDelete.push(["brstm-files", currentTrack.brstm_url]);
        }
      }

      if (editPreviewFile) {
        updateData.preview_url = await uploadFile("previews", editPreviewFile);
        if (currentTrack.preview_url) {
          oldFilesToDelete.push(["previews", currentTrack.preview_url]);
        }
      }

      if (editBrstmLap3File) {
        updateData.brstm_lap3_url = await uploadFile(
          "brstm-files",
          editBrstmLap3File
        );
        if (currentTrack.brstm_lap3_url) {
          oldFilesToDelete.push(["brstm-files", currentTrack.brstm_lap3_url]);
        }
      }

      if (editPreviewLap3File) {
        updateData.preview_lap3_url = await uploadFile(
          "previews",
          editPreviewLap3File
        );
        if (currentTrack.preview_lap3_url) {
          oldFilesToDelete.push(["previews", currentTrack.preview_lap3_url]);
        }
      }

      const { error } = await supabase
        .from("tracks")
        .update(updateData)
        .eq("id", editingTrackId);

      if (error) throw error;

      await Promise.all(
        oldFilesToDelete.map(([bucket, url]) => removeStorageFile(bucket, url))
      );

      setMessage("編集内容を保存しました。");
      cancelEdit();
      await loadTracks();
    } catch (error) {
      console.error(error);
      setMessage("編集内容の保存に失敗しました。");
    }
  }

  async function handleTogglePublish(track: Track) {
    const { error } = await supabase
      .from("tracks")
      .update({ is_published: !track.is_published })
      .eq("id", track.id);

    if (error) {
      console.error(error);
      setMessage("公開状態の変更に失敗しました。");
      return;
    }

    await loadTracks();
  }

  async function handleDelete(track: Track) {
    const ok = window.confirm(
      `${track.title} を削除しますか？\n関連するStorageファイルも削除されます。`
    );

    if (!ok) return;

    const { error } = await supabase.from("tracks").delete().eq("id", track.id);

    if (error) {
      console.error(error);
      setMessage("削除に失敗しました。");
      return;
    }

    await Promise.all([
      removeStorageFile("brstm-files", track.brstm_url),
      removeStorageFile("previews", track.preview_url),
      removeStorageFile("brstm-files", track.brstm_lap3_url),
      removeStorageFile("previews", track.preview_lap3_url),
    ]);

    setMessage("曲と関連ファイルを削除しました。");
    await loadTracks();
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/");
  }

  function renderTags(tags: string) {
    const tagList = tags
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    if (tagList.length === 0) return null;

    return (
      <div className="trackTags">
        {tagList.map((tag) => (
          <span className="tag" key={tag}>
            #{tag}
          </span>
        ))}
      </div>
    );
  }

  if (checking) {
    return (
      <div className="page">
        <main className="main">
          <div className="empty">ログイン確認中...</div>
        </main>
      </div>
    );
  }

  return (
    <div className="page">
      <KeiProjectRail showVolume={false} />

      <header className="header">
        <div className="headerInner">
          <Link className="logoArea linkLogo" href="/">
            <div className="logo">♫</div>
            <span>Kei BRSTM Hub</span>
          </Link>

          <div className="headerButtons">
            <Link className="secondaryButton linkButton" href="/">
              サイトを見る
            </Link>

            <button className="primaryButton" type="button" onClick={handleLogout}>
              ログアウト
            </button>
          </div>
        </div>
      </header>

      <main className="main">
        <section className="adminPanel wide">
          <p className="label">ZIP MUSIC PACK</p>
          <h1 className="adminTitle">ZIPパックを追加</h1>

          <form className="adminForm" onSubmit={handlePackSubmit}>
            <div className="formGrid">
              <label className="formLabel">
                パック名
                <input
                  className="formInput"
                  value={packTitle}
                  onChange={(event) => setPackTitle(event.target.value)}
                  required
                />
              </label>

              <label className="formLabel">
                YouTubeプレビューURL
                <input
                  className="formInput"
                  value={packYoutubeUrl}
                  onChange={(event) => setPackYoutubeUrl(event.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                />
              </label>

              <label className="formLabel">
                ZIP URL
                <input
                  className="formInput"
                  type="url"
                  value={packZipUrl}
                  onChange={(event) => setPackZipUrl(event.target.value)}
                  placeholder="https://github.com/.../releases/download/.../pack.zip"
                  required
                />
              </label>

              <label className="formLabel checkboxLabel">
                <input
                  type="checkbox"
                  checked={packPublished}
                  onChange={(event) => setPackPublished(event.target.checked)}
                />
                公開する
              </label>
            </div>

            <AdminTagPicker
              label="タグ"
              value={packTags}
              onChange={setPackTags}
              suggestions={tagPickerSuggestions}
            />

            <button
              className="primaryButton fullButton"
              type="submit"
              disabled={packSubmitting}
            >
              {packSubmitting ? "登録中..." : "ZIPパックを追加"}
            </button>
          </form>

          {packs.length > 0 && (
            <div className="adminTrackList" style={{ marginTop: "24px" }}>
              {packs.map((pack) => (
                <article className="adminTrackCard" key={pack.id}>
                  <div>
                    <h3>{pack.title}</h3>
                    {pack.tags && renderTags(pack.tags)}
                    <p>YouTube: {pack.youtube_url || "未設定"}</p>
                    <p>ZIP URL: {pack.zip_url || "未設定"}</p>
                    <p>{pack.is_published ? "公開中" : "非公開"}</p>
                  </div>

                  <div className="adminActions">
                    <button
                      className="secondaryButton"
                      type="button"
                      onClick={() => handlePackTogglePublish(pack)}
                    >
                      {pack.is_published ? "非公開にする" : "公開する"}
                    </button>

                    <button
                      className="dangerButton"
                      type="button"
                      onClick={() => handlePackDelete(pack)}
                    >
                      削除
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="adminPanel wide">
          <p className="label">BULK UPLOAD</p>
          <h2 className="adminSubTitle">BRSTMをまとめて追加</h2>

          <p className="formMessage">
            ファイル名の途中に単独の <code>3</code> が入っていても、
            その <code>3</code> を除いた名前のファイルが同時に存在する場合だけ
            Lap 3 として同じ曲にまとめます。
            判定が違う場合は、各ファイルの「所属曲」と「役割」を変更できます。
            別の所属曲へ移動したファイルは、自動的にその曲のLap 3として扱います。
          </p>

          <label className="formLabel">
            BRSTM / MP3 をまとめて選択
            <input
              className="formInput"
              type="file"
              accept=".brstm,.mp3"
              multiple
              onChange={(event) => handleBulkFiles(event.target.files)}
            />
          </label>

          {message && <p className="formMessage">{message}</p>}

          {bulkGroups.length > 0 && (
            <>
              <div
                className="adminActions"
                style={{
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "10px",
                }}
              >
                <label
                  className="checkboxLabel"
                  style={{ minHeight: 0, cursor: "pointer" }}
                >
                  <input
                    type="checkbox"
                    checked={hideCompletedBulkGroups}
                    onChange={(event) =>
                      setHideCompletedBulkGroups(event.target.checked)
                    }
                  />
                  アップロード済みを非表示
                </label>

                <span className="formMessage">
                  {completedBulkGroupCount}曲アップロード済み
                </span>
              </div>

              {visibleBulkGroups.length === 0 ? (
                <div className="empty">
                  すべてアップロード済みです。「アップロード済みを非表示」を外すと確認できます。
                </div>
              ) : (
              <div className="adminTrackList">
                {visibleBulkGroups.map((group) => (
                  <article className="adminTrackCard" key={group.key}>
                    <div className="adminForm">
                      <div className="formGrid">
                        <label className="formLabel">
                          日本語曲名
                          <input
                            className="formInput"
                            value={group.title}
                            onChange={(event) =>
                              updateBulkGroup(group.key, {
                                title: event.target.value,
                              })
                            }
                          />
                        </label>

                        <label className="formLabel">
                          英語曲名
                          <input
                            className="formInput"
                            value={group.titleEn}
                            onChange={(event) =>
                              updateBulkGroup(group.key, {
                                titleEn: event.target.value,
                              })
                            }
                          />
                        </label>

                        <label className="formLabel">
                          カテゴリ
                          <select
                            className="formInput"
                            value={group.category}
                            onChange={(event) =>
                              updateBulkGroup(group.key, {
                                category: event.target.value,
                              })
                            }
                          >
                            {categories.map((item) => (
                              <option key={item} value={item}>
                                {item}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="formLabel">
                          Loop
                          <select
                            className="formInput"
                            value={group.loopType}
                            onChange={(event) =>
                              updateBulkGroup(group.key, {
                                loopType: event.target.value as "loop" | "no",
                              })
                            }
                          >
                            {loopTypes.map((item) => (
                              <option key={item.value} value={item.value}>
                                {item.label}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="formLabel checkboxLabel">
                          <input
                            type="checkbox"
                            checked={group.isPublished}
                            onChange={(event) =>
                              updateBulkGroup(group.key, {
                                isPublished: event.target.checked,
                              })
                            }
                          />
                          公開する
                        </label>
                      </div>

                      <AdminTagPicker
                        label="タグ"
                        value={group.tags}
                        onChange={(nextTags) =>
                          updateBulkGroup(group.key, { tags: nextTags })
                        }
                        suggestions={tagPickerSuggestions}
                      />

                      <div
                        style={{
                          display: "grid",
                          gap: "8px",
                          marginTop: "12px",
                        }}
                      >
                        {group.files.map((item) => (
                          <div
                            key={item.id}
                            style={{
                              display: "grid",
                              gridTemplateColumns: "minmax(260px, 1fr) 190px 190px",
                              gap: "10px",
                              alignItems: "center",
                              padding: "10px 12px",
                              borderRadius: "12px",
                              border: "1px solid rgba(255,255,255,0.08)",
                              background: "rgba(255,255,255,0.02)",
                            }}
                          >
                            <div>
                              <div style={{ fontSize: "13px", fontWeight: 700 }}>
                                {item.name}
                              </div>
                              <div style={{ fontSize: "11px", opacity: 0.55 }}>
                                {item.extension.toUpperCase()} / 現在:{" "}
                                {getRoleLabel(item.role)}
                              </div>

                              {group.files.length > 1 && (
                                <button
                                  className="secondaryButton"
                                  style={{
                                    marginTop: "7px",
                                    padding: "6px 9px",
                                    fontSize: "11px",
                                  }}
                                  type="button"
                                  onClick={() => splitBulkFile(group.key, item.id)}
                                  disabled={bulkUploading || group.status === "done"}
                                >
                                  別の曲として分離
                                </button>
                              )}
                            </div>

                            <label className="formLabel">
                              所属曲
                              <select
                                className="formInput"
                                value={group.key}
                                onChange={(event) =>
                                  moveBulkFile(
                                    group.key,
                                    item.id,
                                    event.target.value
                                  )
                                }
                              >
                                {bulkGroups.map((candidate) => (
                                  <option
                                    key={candidate.key}
                                    value={candidate.key}
                                  >
                                    {candidate.title}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <label className="formLabel">
                              役割
                              <select
                                className="formInput"
                                value={item.role}
                                onChange={(event) =>
                                  updateBulkFileRole(
                                    group.key,
                                    item.id,
                                    event.target.value as BulkRole
                                  )
                                }
                              >
                                <option value="normalBrstm">通常BRSTM</option>
                                <option value="lap3Brstm">Lap 3 BRSTM</option>
                                <option value="normalPreview">通常MP3</option>
                                <option value="lap3Preview">Lap 3 MP3</option>
                                <option value="ignore">アップロードしない</option>
                              </select>
                            </label>
                          </div>
                        ))}
                      </div>

                      <div
                        className="adminActions"
                        style={{
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginTop: "10px",
                        }}
                      >
                        <span className="formMessage">Status: {group.status}</span>

                        <button
                          className="secondaryButton"
                          type="button"
                          onClick={() => handleSingleGroupUpload(group.key)}
                          disabled={
                            bulkUploading ||
                            group.status === "done" ||
                            !group.files.some(
                              (item) => item.role === "normalBrstm"
                            )
                          }
                        >
                          {group.status === "done"
                            ? "アップロード済み"
                            : "この曲だけアップロード"}
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              )}

              <button
                className="primaryButton fullButton"
                type="button"
                onClick={handleBulkUpload}
                disabled={bulkUploading}
              >
                {bulkUploading
                  ? "まとめてアップロード中..."
                  : `${bulkGroups.filter(
                      (group) =>
                        group.status !== "done" &&
                        group.files.some(
                          (item) => item.role === "normalBrstm"
                        )
                    ).length}曲をまとめて登録`}
              </button>
            </>
          )}

          <p className="formMessage">
            ※ BRSTM → MP3 の自動変換はまだ未実装です。現在はMP3も一緒に選択した場合に自動割り当てします。
          </p>
        </section>

        <section className="adminPanel wide">
          <h2 className="adminSubTitle">登録済みの曲</h2>

          <div
            style={{
              display: "grid",
              gap: "10px",
              marginBottom: "10px",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) auto",
                gap: "10px",
                alignItems: "center",
              }}
            >
              <input
                className="formInput"
                value={adminTrackQuery}
                onChange={(event) => setAdminTrackQuery(event.target.value)}
                placeholder="曲名・英語名・カテゴリ・Loopなどで検索"
              />

              {(adminTrackQuery || adminTrackTagQuery) && (
                <button
                  className="secondaryButton"
                  type="button"
                  onClick={() => {
                    setAdminTrackQuery("");
                    setAdminTrackTagQuery("");
                  }}
                >
                  クリア
                </button>
              )}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) 220px",
                gap: "10px",
              }}
            >
              <TagSearchInput
                className="formInput"
                value={adminTrackTagQuery}
                onChange={setAdminTrackTagQuery}
                suggestions={tagSearchSuggestions}
                language="ja"
                placeholder="タグをカンマ区切りで検索 例: Pokémon, ORAS"
              />

              <select
                className="formInput"
                value={adminTrackTagMode}
                onChange={(event) =>
                  setAdminTrackTagMode(event.target.value as "all" | "any")
                }
              >
                <option value="all">完全一致（すべて含む）</option>
                <option value="any">1つでも一致</option>
              </select>
            </div>
          </div>

          <p className="formMessage" style={{ marginBottom: "14px" }}>
            {hasAdminTrackFilter
              ? `${adminTrackMatches.length}件ヒット${
                  adminTrackMatches.length > 50 ? "（先頭50件を表示）" : ""
                }`
              : `全${tracks.length}曲のうち、最近登録した8曲だけ表示しています。過去の曲は検索してください。`}
          </p>

          <div className="adminTrackList">
            {visibleAdminTracks.map((track) => (
              <article className="adminTrackCard" key={track.id}>
                {editingTrackId === track.id ? (
                  <form className="adminForm" onSubmit={handleEditSubmit}>
                    <div className="formGrid">
                      <label className="formLabel">
                        日本語曲名
                        <input
                          className="formInput"
                          value={editTitle}
                          onChange={(event) => setEditTitle(event.target.value)}
                          required
                        />
                      </label>

                      <label className="formLabel">
                        英語曲名
                        <input
                          className="formInput"
                          value={editTitleEn}
                          onChange={(event) => setEditTitleEn(event.target.value)}
                        />
                      </label>

                      <label className="formLabel">
                        カテゴリ
                        <select
                          className="formInput"
                          value={editCategory}
                          onChange={(event) => setEditCategory(event.target.value)}
                        >
                          {categories.map((item) => (
                            <option key={item} value={item}>
                              {item}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="formLabel">
                        Loop
                        <select
                          className="formInput"
                          value={editLoopType}
                          onChange={(event) =>
                            setEditLoopType(event.target.value as "loop" | "no")
                          }
                        >
                          {loopTypes.map((item) => (
                            <option key={item.value} value={item.value}>
                              {item.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="formLabel checkboxLabel">
                        <input
                          type="checkbox"
                          checked={editIsPublished}
                          onChange={(event) =>
                            setEditIsPublished(event.target.checked)
                          }
                        />
                        公開する
                      </label>
                    </div>

                    <AdminTagPicker
                      label="タグ"
                      value={editTags}
                      onChange={setEditTags}
                      suggestions={tagPickerSuggestions}
                    />

                    <div className="formGrid">
                      <label className="formLabel">
                        通常用BRSTMを差し替え
                        <input
                          className="formInput"
                          type="file"
                          accept=".brstm"
                          onChange={(event) =>
                            setEditBrstmFile(event.target.files?.[0] ?? null)
                          }
                        />
                      </label>

                      <label className="formLabel">
                        通常用プレビューMP3を差し替え
                        <input
                          className="formInput"
                          type="file"
                          accept=".mp3"
                          onChange={(event) =>
                            setEditPreviewFile(event.target.files?.[0] ?? null)
                          }
                        />
                      </label>

                      <label className="formLabel">
                        Lap 3用BRSTMを差し替え
                        <input
                          className="formInput"
                          type="file"
                          accept=".brstm"
                          onChange={(event) =>
                            setEditBrstmLap3File(
                              event.target.files?.[0] ?? null
                            )
                          }
                        />
                      </label>

                      <label className="formLabel">
                        Lap 3用プレビューMP3を差し替え
                        <input
                          className="formInput"
                          type="file"
                          accept=".mp3"
                          onChange={(event) =>
                            setEditPreviewLap3File(
                              event.target.files?.[0] ?? null
                            )
                          }
                        />
                      </label>
                    </div>

                    <div className="adminActions">
                      <button className="primaryButton" type="submit">
                        保存する
                      </button>

                      <button
                        className="secondaryButton"
                        type="button"
                        onClick={cancelEdit}
                      >
                        キャンセル
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div>
                      <h3>{track.title}</h3>
                      <p>英語名: {track.title_en || track.title}</p>
                      <p>
                        {track.category} / {getLoopValue(track.loop_type)}
                      </p>
                      {track.tags && renderTags(track.tags)}
                      <p>
                        通常: {track.brstm_url ? "BRSTMあり" : "BRSTMなし"} / 通常プレビュー:{" "}
                        {track.preview_url ? "MP3あり" : "MP3なし"}
                      </p>
                      <p>
                        Lap 3: {track.brstm_lap3_url ? "BRSTMあり" : "BRSTMなし"} / Lap 3プレビュー:{" "}
                        {track.preview_lap3_url ? "MP3あり" : "MP3なし"}
                      </p>
                      <p>{track.is_published ? "公開中" : "非公開"}</p>

                      <div
                        className="adminActions"
                        style={{ marginTop: "10px" }}
                      >
                        <button
                          className="secondaryButton"
                          type="button"
                          disabled={!track.preview_url}
                          onClick={() =>
                            handleAdminPreview(
                              track,
                              track.preview_url,
                              "normal"
                            )
                          }
                        >
                          {adminPlayingKey === `${track.id}-normal`
                            ? "■ 通常を停止"
                            : "▶ 通常を試聴"}
                        </button>

                        <button
                          className="secondaryButton"
                          type="button"
                          disabled={!track.preview_lap3_url}
                          onClick={() =>
                            handleAdminPreview(
                              track,
                              track.preview_lap3_url,
                              "lap3"
                            )
                          }
                        >
                          {adminPlayingKey === `${track.id}-lap3`
                            ? "■ Lap 3を停止"
                            : "▶ Lap 3を試聴"}
                        </button>
                      </div>
                    </div>

                    <div className="adminActions">
                      <button
                        className="secondaryButton"
                        type="button"
                        onClick={() => startEdit(track)}
                      >
                        編集
                      </button>

                      <button
                        className="secondaryButton"
                        type="button"
                        onClick={() => handleTogglePublish(track)}
                      >
                        {track.is_published ? "非公開にする" : "公開する"}
                      </button>

                      <button
                        className="dangerButton"
                        type="button"
                        onClick={() => handleDelete(track)}
                      >
                        削除
                      </button>
                    </div>
                  </>
                )}
              </article>
            ))}

            {visibleAdminTracks.length === 0 && (
              <div className="empty">
                {hasAdminTrackFilter
                  ? "条件に一致する登録済み曲はありません."
                  : "登録済みの曲はありません。"}
              </div>
            )}
          </div>
        </section>

        <section className="adminPanel wide">
          <p className="label">TAG MANAGEMENT</p>
          <h2 className="adminSubTitle">タグ管理</h2>

          <p className="formMessage">
            タグ名の変更・削除は、そのタグを使っているすべての曲とMusic Packに反映されます。英語名は空欄なら日本語名をそのまま使います。
          </p>

          <div
            style={{
              margin: "18px 0 24px",
              padding: "16px",
              border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: "14px",
              background: "rgba(255,255,255,0.02)",
            }}
          >
            <h3 style={{ margin: "0 0 6px" }}>タグを複数曲へ一括追加</h3>
            <p className="formMessage" style={{ marginBottom: "12px" }}>
              後から作ったタグも、曲名・英語名・既存タグで対象曲を検索してまとめて付けられます。
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(220px, 0.7fr) minmax(280px, 1fr)",
                gap: "10px",
              }}
            >
              <label className="formLabel">
                追加するタグ
                <input
                  className="formInput"
                  value={bulkTagName}
                  onChange={(event) => setBulkTagName(event.target.value)}
                  placeholder="例: Pokémon"
                />
              </label>

              <label className="formLabel">
                対象曲を検索
                <input
                  className="formInput"
                  value={bulkTagTrackQuery}
                  onChange={(event) => {
                    setBulkTagTrackQuery(event.target.value);
                    setBulkTagSelectedTrackIds([]);
                  }}
                  placeholder="曲名・英語名・カテゴリ"
                />
              </label>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) 220px",
                gap: "10px",
                marginTop: "10px",
              }}
            >
              <TagSearchInput
                className="formInput"
                value={bulkTagFilterQuery}
                onChange={setBulkTagFilterQuery}
                onAfterChange={() => setBulkTagSelectedTrackIds([])}
                suggestions={tagSearchSuggestions}
                language="ja"
                placeholder="既存タグをカンマ区切りで絞り込み"
              />

              <select
                className="formInput"
                value={bulkTagFilterMode}
                onChange={(event) => {
                  setBulkTagFilterMode(event.target.value as "all" | "any");
                  setBulkTagSelectedTrackIds([]);
                }}
              >
                <option value="all">完全一致（すべて含む）</option>
                <option value="any">1つでも一致</option>
              </select>
            </div>

            {(bulkTagTrackQuery.trim() || bulkTagFilterQuery.trim()) ? (
              <>
                <div
                  className="adminActions"
                  style={{
                    justifyContent: "flex-start",
                    margin: "12px 0 8px",
                  }}
                >
                  <button
                    className="secondaryButton"
                    type="button"
                    onClick={selectAllBulkTagMatches}
                    disabled={bulkTagTrackMatches.length === 0}
                  >
                    検索結果{bulkTagTrackMatches.length}件を全選択
                  </button>

                  <button
                    className="secondaryButton"
                    type="button"
                    onClick={() => setBulkTagSelectedTrackIds([])}
                    disabled={bulkTagSelectedTrackIds.length === 0}
                  >
                    選択解除
                  </button>

                  <span className="formMessage">
                    {bulkTagSelectedTrackIds.length}曲選択中
                  </span>
                </div>

                <div
                  style={{
                    display: "grid",
                    gap: "6px",
                    maxHeight: "280px",
                    overflowY: "auto",
                    paddingRight: "4px",
                  }}
                >
                  {bulkTagTrackMatches.map((track) => (
                    <label
                      key={`bulk-tag-${track.id}`}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "auto minmax(0, 1fr)",
                        gap: "10px",
                        alignItems: "center",
                        padding: "9px 10px",
                        border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: "10px",
                        background: bulkTagSelectedTrackIds.includes(track.id)
                          ? "rgba(255,255,255,0.06)"
                          : "rgba(255,255,255,0.015)",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={bulkTagSelectedTrackIds.includes(track.id)}
                        onChange={() => toggleBulkTagTrackSelection(track.id)}
                      />
                      <span style={{ minWidth: 0 }}>
                        <strong>{track.title}</strong>
                        {track.title_en && track.title_en !== track.title
                          ? ` / ${track.title_en}`
                          : ""}
                        <span
                          style={{
                            display: "block",
                            marginTop: "2px",
                            fontSize: "11px",
                            opacity: 0.55,
                          }}
                        >
                          {track.tags || "タグなし"}
                        </span>
                      </span>
                    </label>
                  ))}

                  {bulkTagTrackMatches.length === 0 && (
                    <div className="empty">
                      条件に一致する曲はありません。
                    </div>
                  )}
                </div>

                <button
                  className="primaryButton fullButton"
                  type="button"
                  style={{ marginTop: "12px" }}
                  onClick={handleBulkAddTag}
                  disabled={
                    bulkTagApplying ||
                    bulkTagSelectedTrackIds.length === 0 ||
                    !bulkTagName.trim()
                  }
                >
                  {bulkTagApplying
                    ? "タグを追加中..."
                    : `選択した${bulkTagSelectedTrackIds.length}曲にタグを追加`}
                </button>
              </>
            ) : (
              <p className="formMessage" style={{ marginTop: "12px" }}>
                対象曲を検索すると選択リストが表示されます。
              </p>
            )}
          </div>

          {tagSuggestions.length === 0 ? (
            <div className="empty">現在登録されているタグはありません。</div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                gap: "8px",
              }}
            >
              {tagSuggestions.map((tag) => (
                <div
                  key={tag}
                  style={{
                    display: "grid",
                    gap: "7px",
                    padding: "9px",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: "10px",
                    background: "rgba(255,255,255,0.02)",
                  }}
                >
                  <label className="formLabel">
                    日本語タグ名
                    <input
                      className="formInput"
                      style={{ minWidth: 0, padding: "8px 9px" }}
                      value={tagDrafts[tag] ?? tag}
                      onChange={(event) =>
                        setTagDrafts((current) => ({
                          ...current,
                          [tag]: event.target.value,
                        }))
                      }
                    />
                  </label>

                  <label className="formLabel">
                    英語タグ名（空欄なら日本語名）
                    <input
                      className="formInput"
                      style={{ minWidth: 0, padding: "8px 9px" }}
                      value={
                        tagEnglishDrafts[tag] ??
                        tagDefinitions.find(
                          (definition) =>
                            definition.name.toLowerCase() === tag.toLowerCase()
                        )?.name_en ??
                        ""
                      }
                      onChange={(event) =>
                        setTagEnglishDrafts((current) => ({
                          ...current,
                          [tag]: event.target.value,
                        }))
                      }
                      placeholder={tag}
                    />
                  </label>

                  <div className="adminActions" style={{ justifyContent: "flex-start" }}>
                    <button
                      className="secondaryButton"
                      style={{ padding: "8px 9px" }}
                      type="button"
                      onClick={() => handleRenameTag(tag)}
                      title="日本語タグ名を変更"
                    >
                      日本語名を変更
                    </button>

                    <button
                      className="secondaryButton"
                      style={{ padding: "8px 9px" }}
                      type="button"
                      onClick={() => handleSaveTagEnglish(tag)}
                      title="英語タグ名を保存"
                    >
                      英語名を保存
                    </button>

                    <button
                      className="dangerButton"
                      style={{ padding: "8px 9px" }}
                      type="button"
                      onClick={() => handleDeleteTag(tag)}
                      title="タグを削除"
                    >
                      削除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {showDuplicateReview && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="類似タイトルの確認"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2000,
            display: "grid",
            placeItems: "center",
            padding: "20px",
            background: "rgba(0,0,0,0.72)",
            backdropFilter: "blur(6px)",
          }}
        >
          <div
            style={{
              width: "min(760px, 96vw)",
              maxHeight: "82vh",
              overflowY: "auto",
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: "16px",
              padding: "20px",
              background: "#0c0c0f",
              boxShadow: "0 24px 80px rgba(0,0,0,0.55)",
            }}
          >
            <p className="label">DUPLICATE CHECK</p>
            <h2 className="adminSubTitle">似たタイトルの公開曲があります</h2>
            <p className="formMessage">
              重複登録の可能性があります。不要な曲はこの画面で「アップロードしない」を選べます。
            </p>

            <div style={{ display: "grid", gap: "10px", marginTop: "14px" }}>
              {duplicateReview.map((item) => (
                <div
                  key={item.groupKey}
                  style={{
                    padding: "12px",
                    border: "1px solid rgba(255,255,255,0.09)",
                    borderRadius: "12px",
                    background: "rgba(255,255,255,0.025)",
                  }}
                >
                  <div style={{ fontWeight: 800, marginBottom: "8px" }}>
                    新規: {item.incomingTitle}
                  </div>

                  <div style={{ display: "grid", gap: "6px" }}>
                    {item.matches.map((match) => (
                      <div
                        key={`${item.groupKey}-${match.id}`}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: "12px",
                          alignItems: "center",
                          padding: "8px 10px",
                          borderRadius: "9px",
                          background: "rgba(255,255,255,0.035)",
                        }}
                      >
                        <span>
                          既存: {match.title}
                          {match.titleEn !== match.title ? ` / ${match.titleEn}` : ""}
                        </span>
                        <strong style={{ whiteSpace: "nowrap" }}>
                          {Math.round(match.score * 100)}%
                        </strong>
                      </div>
                    ))}
                  </div>

                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "9px",
                      marginTop: "10px",
                      padding: "9px 10px",
                      borderRadius: "9px",
                      border: duplicateSkippedGroupKeys.includes(item.groupKey)
                        ? "1px solid rgba(248,113,113,0.52)"
                        : "1px solid rgba(255,255,255,0.09)",
                      background: duplicateSkippedGroupKeys.includes(item.groupKey)
                        ? "rgba(248,113,113,0.08)"
                        : "rgba(255,255,255,0.02)",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={duplicateSkippedGroupKeys.includes(item.groupKey)}
                      onChange={(event) =>
                        setDuplicateSkippedGroupKeys((current) =>
                          event.target.checked
                            ? [...current, item.groupKey]
                            : current.filter((key) => key !== item.groupKey)
                        )
                      }
                    />
                    この曲はアップロードしない
                  </label>
                </div>
              ))}
            </div>

            <div
              className="adminActions"
              style={{ justifyContent: "flex-end", marginTop: "18px" }}
            >
              <button
                className="secondaryButton"
                type="button"
                onClick={() => {
                  setShowDuplicateReview(false);
                  setPendingUploadGroupKeys([]);
                }}
              >
                戻って確認する
              </button>

              <button
                className="primaryButton"
                type="button"
                onClick={handleConfirmDuplicateUpload}
              >
                {duplicateSkippedGroupKeys.length > 0
                  ? `${duplicateSkippedGroupKeys.length}曲を除外して登録`
                  : "このまま登録する"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
