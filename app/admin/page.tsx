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

type BulkTitleSuggestion = {
  title: string;
  titleEn: string;
  source: "filename" | "registered";
  score: number;
  trackId?: number;
  previewUrl?: string;
  previewLap3Url?: string;
};

/** Preview availability follows the assigned file roles, not the original file names. */
function getMissingBulkPreviews(group: BulkGroup): string[] {
  const roles = new Set(group.files.map((file) => file.role));
  const missing: string[] = [];
  if (roles.has("normalBrstm") && !roles.has("normalPreview")) {
    missing.push("通常プレビューMP3");
  }
  if (roles.has("lap3Brstm") && !roles.has("lap3Preview")) {
    missing.push("Lap 3プレビューMP3");
  }
  return missing;
}

function getMissingTrackPreviews(track: Track): string[] {
  const missing: string[] = [];
  if (track.brstm_url && !track.preview_url) missing.push("通常プレビューMP3");
  if (track.brstm_lap3_url && !track.preview_lap3_url) {
    missing.push("Lap 3プレビューMP3");
  }
  return missing;
}

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

const japaneseCharacters = /[\u3040-\u30ff\u3400-\u9fff]/u;
const latinCharacters = /[A-Za-z]/;
const soundtrackLabel = /\b(?:ost|bgm|soundtrack|remix|version|instrumental|cover|karaoke|loop|lap ?3)\b/i;

function removeSoundtrackSuffix(value: string) {
  return value.replace(/\s*[[(（【][^\])）】]*(?:OST|BGM|soundtrack)[^\])）】]*[\])）】]\s*$/i, "").trim();
}

/** Only accept bilingual segments when the script boundary is unambiguous. */
function extractBilingualFilenameTitle(value: string) {
  const parts = value.split(/\s+(?:\/|\||｜|[-–—])\s+|\s*／\s*/).map((part) => part.trim());

  let pair: string[] | null = parts.length === 2 ? parts : null;
  if (!pair) {
    const parenthesized = value.match(/^(.+?)\s*[（(]([^()（）]+)[)）]$/);
    if (parenthesized) pair = [parenthesized[1].trim(), parenthesized[2].trim()];
  }
  if (!pair) return null;

  const [left, right] = pair;
  const leftJa = japaneseCharacters.test(left);
  const rightJa = japaneseCharacters.test(right);
  if (leftJa === rightJa || soundtrackLabel.test(left) || soundtrackLabel.test(right)) {
    return null;
  }

  const japanese = leftJa ? left : right;
  const english = leftJa ? right : left;
  return latinCharacters.test(english) && japanese.length > 1 && english.length > 1
    ? { title: japanese, titleEn: english }
    : null;
}

/** Suggestions are never saved until selected by the user. */
function buildBulkTitleSuggestions(group: BulkGroup, tracks: Track[]): BulkTitleSuggestion[] {
  const sourceFiles = [
    ...group.files.filter((item) => item.role === "normalBrstm"),
    ...group.files,
  ];
  const names = Array.from(new Set(
    sourceFiles.flatMap((item) => {
      const stem = cleanBaseName(removeExplicitLap3Marker(stripExtension(item.name)).baseName);
      return [stem, removeSoundtrackSuffix(stem)];
    }).filter(Boolean)
  ));
  const suggestions: BulkTitleSuggestion[] = [];
  const add = (candidate: BulkTitleSuggestion) => {
    if (!candidate.title.trim() || !candidate.titleEn.trim()) return;
    if (candidate.source === "filename" && candidate.title === group.title &&
      candidate.titleEn === group.titleEn) return;
    const existingIndex = suggestions.findIndex((item) =>
      normalizeCompareName(item.title) === normalizeCompareName(candidate.title) &&
      normalizeCompareName(item.titleEn) === normalizeCompareName(candidate.titleEn)
    );
    if (existingIndex !== -1) {
      // A registered match is more useful than a filename-only suggestion,
      // because its existing MP3 can be auditioned.
      if (candidate.source === "registered" &&
        suggestions[existingIndex].source === "filename") {
        suggestions[existingIndex] = candidate;
      }
      return;
    }
    suggestions.push(candidate);
  };

  const primaryFiles = group.files.filter((item) => item.role === "normalBrstm");
  for (const file of primaryFiles.length > 0 ? primaryFiles : group.files) {
    // Inspect raw filenames so a bilingual " - " separator is not lost
    // to grouping normalization.
    const pair = extractBilingualFilenameTitle(stripExtension(file.name));
    if (pair) {
      add({ ...pair, source: "filename", score: 1 });
    }
  }

  for (const track of tracks) {
    if (!track.title?.trim() || !track.title_en?.trim()) continue;
    const matchedScore = Math.max(0, ...names.flatMap((name) =>
      [track.title, track.title_en].map((known) => titleSimilarity(name, known))
    ));
    if (matchedScore >= 0.88) {
      add({
        title: track.title.trim(),
        titleEn: track.title_en.trim(),
        source: "registered",
        score: matchedScore,
        trackId: track.id,
        previewUrl: track.preview_url || "",
        previewLap3Url: track.preview_lap3_url || "",
      });
    }
  }

  // For an English-only filename, offer it as an English-field candidate,
  // not as a fabricated Japanese translation.
  if (suggestions.length === 0) {
    const name = names.find((value) =>
      latinCharacters.test(value) && !japaneseCharacters.test(value)
    );
    if (name) add({ title: group.title, titleEn: name, source: "filename", score: 0.5 });
  }

  return suggestions
    .sort((a, b) =>
      Number(b.source === "registered") - Number(a.source === "registered") ||
      b.score - a.score
    )
    .slice(0, 3);
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
  const adminPlayingKeyRef = useRef<string | null>(null);
  const adminObjectUrlRef = useRef<string | null>(null);
  const [tagSortMode, setTagSortMode] = useState<"alphabetical" | "newest" | "count">("alphabetical");
  const [tagSortDirection, setTagSortDirection] = useState<"asc" | "desc">("asc");
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
  const [missingPreviewQuery, setMissingPreviewQuery] = useState("");
  const [missingPreviewLimit, setMissingPreviewLimit] = useState(50);

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

  // "Newest" means the newest track/pack registration containing this tag.
  // The tag_definitions table does not currently expose a tag creation date.
  const tagManagementStats = useMemo(() => {
    const stats = new Map<string, { count: number; lastUsedAt: number; trackCount: number; packCount: number }>();
    const add = (tags: string, createdAt: string, kind: "track" | "pack") => {
      const timestamp = Date.parse(createdAt);
      for (const name of new Set(splitTagList(tags).map((tag) => tag.toLowerCase()))) {
        const current = stats.get(name) ?? { count: 0, lastUsedAt: 0, trackCount: 0, packCount: 0 };
        current.count++;
        if (kind === "track") current.trackCount++;
        else current.packCount++;
        if (Number.isFinite(timestamp)) current.lastUsedAt = Math.max(current.lastUsedAt, timestamp);
        stats.set(name, current);
      }
    };
    for (const track of tracks) add(track.tags || "", track.created_at, "track");
    for (const pack of packs) add(pack.tags || "", pack.created_at, "pack");
    return stats;
  }, [tracks, packs]);

  const sortedManagementTags = useMemo(() => {
    const nameOrder = (a: string, b: string) =>
      a.localeCompare(b, "en", { sensitivity: "base", numeric: true });
    const direction = tagSortDirection === "asc" ? 1 : -1;
    return [...tagSuggestions].sort((a, b) => {
      const left = tagManagementStats.get(a.toLowerCase());
      const right = tagManagementStats.get(b.toLowerCase());
      if (tagSortMode === "alphabetical") return direction * nameOrder(a, b);
      const valueA = tagSortMode === "count" ? (left?.count ?? 0) : (left?.lastUsedAt ?? 0);
      const valueB = tagSortMode === "count" ? (right?.count ?? 0) : (right?.lastUsedAt ?? 0);
      return direction * (valueA - valueB) || nameOrder(a, b);
    });
  }, [tagSuggestions, tagManagementStats, tagSortMode, tagSortDirection]);

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

  const missingPreviewTracks = useMemo(
    () => tracks.filter((track) => getMissingTrackPreviews(track).length > 0),
    [tracks]
  );

  const matchingMissingPreviews = useMemo(() => {
    const query = missingPreviewQuery.trim().toLocaleLowerCase();
    if (!query) return missingPreviewTracks;
    return missingPreviewTracks.filter((track) =>
      [track.title, track.title_en, track.category, track.tags]
        .join(" ")
        .toLocaleLowerCase()
        .includes(query)
    );
  }, [missingPreviewTracks, missingPreviewQuery]);

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

  const bulkTitleSuggestions = useMemo(() => new Map(
    bulkGroups.map((group) => [
      group.key,
      buildBulkTitleSuggestions(group, tracks),
    ])
  ), [bulkGroups, tracks]);

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

  function stopAdminAudio() {
    // Release the player before pausing, so stale events and play() promises
    // cannot change the state of a newer preview.
    const oldAudio = adminAudioRef.current;
    const oldObjectUrl = adminObjectUrlRef.current;
    adminAudioRef.current = null;
    adminPlayingKeyRef.current = null;
    adminObjectUrlRef.current = null;
    oldAudio?.pause();
    if (oldAudio) oldAudio.currentTime = 0;
    if (oldObjectUrl) URL.revokeObjectURL(oldObjectUrl);
    setAdminPlayingKey(null);
  }

  useEffect(() => {
    return () => {
      adminAudioRef.current?.pause();
      if (adminObjectUrlRef.current) URL.revokeObjectURL(adminObjectUrlRef.current);
      adminAudioRef.current = null;
      adminPlayingKeyRef.current = null;
      adminObjectUrlRef.current = null;
    };
  }, []);

  async function playAdminAudio(key: string, source: string | File) {
    const wasSamePreview = adminPlayingKeyRef.current === key &&
      adminAudioRef.current !== null;
    stopAdminAudio();
    if (wasSamePreview) return;

    let objectUrl: string | null = null;
    let audio: HTMLAudioElement | null = null;
    try {
      if (source instanceof File) objectUrl = URL.createObjectURL(source);
      audio = new Audio(objectUrl ?? (source as string));
      const savedVolume = Number(window.localStorage.getItem("kei-brstm-hub-volume") ?? "0.5");
      audio.volume = Number.isFinite(savedVolume)
        ? Math.min(0.5, Math.max(0, savedVolume))
        : 0.5;

      const clear = () => {
        if (adminAudioRef.current !== audio) return;
        stopAdminAudio();
      };
      audio.addEventListener("ended", clear);
      audio.addEventListener("error", () => {
        if (adminAudioRef.current !== audio) return;
        clear();
        setMessage("プレビューを再生できませんでした。");
      });

      adminAudioRef.current = audio;
      adminPlayingKeyRef.current = key;
      adminObjectUrlRef.current = objectUrl;
      setAdminPlayingKey(key);
      await audio.play();
    } catch (error) {
      // Check Audio identity, not just the key: the same button may have
      // been started again before an older play() promise settles.
      if (adminAudioRef.current !== audio || !audio) {
        if (objectUrl && adminObjectUrlRef.current !== objectUrl) URL.revokeObjectURL(objectUrl);
        return;
      }
      console.error("Admin preview failed:", error);
      stopAdminAudio();
      setMessage("プレビューを再生できませんでした。");
    }
  }

  function handleAdminPreview(track: Track, previewUrl: string, variant: "normal" | "lap3") {
    if (!previewUrl) {
      setMessage(variant === "normal"
        ? "通常プレビューMP3が登録されていません。"
        : "Lap 3プレビューMP3が登録されていません。");
      return;
    }
    void playAdminAudio(`${track.id}-${variant}`, previewUrl);
  }

  function handleQueuedMp3Preview(file: BulkGroupFile) {
    if (file.extension !== "mp3") return;
    void playAdminAudio(`upload-file-${file.id}`, file.file);
  }

  function handleDuplicatePreview(suggestion: BulkTitleSuggestion, variant: "normal" | "lap3") {
    const url = variant === "normal" ? suggestion.previewUrl : suggestion.previewLap3Url;
    if (!url || suggestion.trackId === undefined) return;
    void playAdminAudio(`duplicate-${suggestion.trackId}-${variant}`, url);
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
    stopAdminAudio();

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
    const nameEn = (tagEnglishDrafts[tag] ?? tagDefinitions.find(
      (definition) => definition.name.toLowerCase() === tag.toLowerCase()
    )?.name_en ?? "").trim();

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
          : `#${tag} の英語名を空欄にしました。`
      );
      await loadTagDefinitions();
    } catch (error) {
      console.error(error);
      setMessage("英語名を保存できませんでした。");
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

  async function handleSaveTag(tag: string) {
    const newTag = (tagDrafts[tag] ?? tag).trim();
    if (!newTag) {
      setMessage("日本語名を入力してください。");
      return;
    }

    const previousEnglish = tagDefinitions.find(
      (definition) => definition.name.toLowerCase() === tag.toLowerCase()
    )?.name_en ?? "";
    const nextEnglish = (tagEnglishDrafts[tag] ?? previousEnglish).trim();

    if (newTag.toLowerCase() !== tag.toLowerCase()) {
      await handleRenameTag(tag);
    } else if (nextEnglish !== previousEnglish.trim()) {
      await handleSaveTagEnglish(tag);
    } else {
      setMessage("変更はありません。");
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

  async function handleUploadThroughGroup(groupKey: string) {
    // Follow the current on-screen order; completed groups are skipped by
    // prepareGroupUpload, even when the user is showing completed uploads.
    const endIndex = visibleBulkGroups.findIndex((group) => group.key === groupKey);
    if (endIndex === -1) return;

    await prepareGroupUpload(visibleBulkGroups.slice(0, endIndex + 1));
  }

  function handleCancelBulkGroup(groupKey: string) {
    if (bulkUploading) return;
    const group = bulkGroups.find((item) => item.key === groupKey);
    if (!group || group.status === "done") return;
    if (group.files.some((item) => adminPlayingKeyRef.current === `upload-file-${item.id}`)) {
      stopAdminAudio();
    }

    // Remove this local pending group only; uploaded tracks and files are untouched.
    setBulkGroups((current) => current.filter((item) => item.key !== groupKey));
    setPendingUploadGroupKeys((current) => current.filter((key) => key !== groupKey));
    setDuplicateSkippedGroupKeys((current) => current.filter((key) => key !== groupKey));
    setDuplicateReview((current) => current.filter((item) => item.groupKey !== groupKey));
    setMessage(`${group.title} を待機一覧から除外しました。`);
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

  function navigateToAdminSection(sectionId: string) {
    const section = document.getElementById(sectionId);
    if (section instanceof HTMLDetailsElement) {
      section.open = true;
    }
    requestAnimationFrame(() => {
      section?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function editMissingPreview(track: Track) {
    startEdit(track);
    setAdminTrackQuery(track.title);
    setAdminTrackTagQuery("");
    const section = document.getElementById("admin-tracks");
    if (section instanceof HTMLDetailsElement) section.open = true;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        (document.getElementById(`admin-track-${track.id}`) || section)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    });
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
        <nav className="adminSectionNav" aria-label="管理画面の項目">
          {[
            { id: "admin-bulk", label: "BRSTM一括追加" },
            { id: "admin-packs", label: "ZIPパック追加" },
            { id: "admin-missing-previews", label: `⚠️ プレビュー未登録 (${missingPreviewTracks.length})` },
            { id: "admin-tracks", label: "登録済みの曲" },
            { id: "admin-tags", label: "タグ管理" },
          ].map((item) => (
            <a
              href={`#${item.id}`}
              key={item.id}
              onClick={() => navigateToAdminSection(item.id)}
            >
              {item.label}
            </a>
          ))}
        </nav>

        <details className="adminPanel wide adminCollapsiblePanel" id="admin-bulk" open>
          <summary className="adminSectionSummary">
            <span className="adminSectionSummaryTitle">
              <span className="label">BULK UPLOAD</span>
              <span className="adminSubTitle">BRSTMをまとめて追加</span>
            </span>
            <span className="adminSectionChevron" aria-hidden="true" />
          </summary>
          <div className="adminSectionBody">

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

                        {(["registered", "filename"] as const).map((source) => {
                          const suggestions = (bulkTitleSuggestions.get(group.key) ?? [])
                            .filter((item) => item.source === source);
                          if (!suggestions.length) return null;
                          return (
                            <div className="bulkTitleSuggestions" key={source}>
                              <span className="bulkTitleSuggestionHeading">
                                {source === "registered" ? "重複候補" : "ファイル名候補"}
                              </span>
                              {suggestions.map((suggestion, index) => (
                                <div className="bulkTitleCandidate" key={suggestion.trackId ?? index}>
                                  <button
                                    className="secondaryButton bulkTitleSuggestion"
                                    type="button"
                                    title="この曲名を入力欄へ反映"
                                    onClick={() => updateBulkGroup(group.key, {
                                      title: suggestion.title,
                                      titleEn: suggestion.titleEn,
                                    })}
                                  >
                                    <span>{suggestion.title}</span>
                                    <span>{suggestion.titleEn}</span>
                                    <small>名前を適用</small>
                                  </button>
                                  {source === "registered" && (
                                    <div className="bulkDuplicatePreviews">
                                      {suggestion.previewUrl && (
                                        <button
                                          className="secondaryButton adminBulkPreviewButton"
                                          type="button"
                                          onClick={() => handleDuplicatePreview(suggestion, "normal")}
                                          title="登録済み曲の通常MP3を試聴"
                                        >
                                          {adminPlayingKey === `duplicate-${suggestion.trackId}-normal`
                                            ? "■ 停止" : "▶ 通常"}
                                        </button>
                                      )}
                                      {suggestion.previewLap3Url && (
                                        <button
                                          className="secondaryButton adminBulkPreviewButton"
                                          type="button"
                                          onClick={() => handleDuplicatePreview(suggestion, "lap3")}
                                          title="登録済み曲のLap 3 MP3を試聴"
                                        >
                                          {adminPlayingKey === `duplicate-${suggestion.trackId}-lap3`
                                            ? "■ 停止" : "▶ L3"}
                                        </button>
                                      )}
                                      {!suggestion.previewUrl && !suggestion.previewLap3Url && (
                                        <small className="bulkDuplicateNoPreview">MP3未登録</small>
                                      )}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          );
                        })}

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

                      {getMissingBulkPreviews(group).length > 0 && (
                        <div className="previewMissingNotice" role="status">
                          <span aria-hidden="true">⚠️</span>
                          <span>
                            プレビュー未選択：{getMissingBulkPreviews(group).join("・")}
                          </span>
                        </div>
                      )}

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

                              <div className="adminBulkFileActions">
                                {item.extension === "mp3" && (
                                  <button
                                    className="secondaryButton adminBulkPreviewButton"
                                    type="button"
                                    onClick={() => handleQueuedMp3Preview(item)}
                                    title="アップロード待機中のMP3を試聴"
                                  >
                                    {adminPlayingKey === `upload-file-${item.id}`
                                      ? "■ 停止" : "▶ MP3試聴"}
                                  </button>
                                )}
                                {group.files.length > 1 && (
                                  <button
                                    className="secondaryButton adminBulkPreviewButton"
                                    type="button"
                                    onClick={() => splitBulkFile(group.key, item.id)}
                                    disabled={bulkUploading || group.status === "done"}
                                  >
                                    別の曲として分離
                                  </button>
                                )}
                              </div>
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
                        <span className="formMessage" style={{ marginRight: "auto" }}>
                          Status: {group.status}
                        </span>

                        <div className="adminActions" style={{ justifyContent: "flex-end" }}>
                          <button
                            className="secondaryButton"
                            type="button"
                            onClick={() => handleSingleGroupUpload(group.key)}
                            disabled={
                              bulkUploading ||
                              group.status === "done" ||
                              !group.files.some((item) => item.role === "normalBrstm")
                            }
                          >
                            {group.status === "done"
                              ? "アップロード済み"
                              : "この曲だけアップロード"}
                          </button>

                          <button
                            className="secondaryButton"
                            type="button"
                            onClick={() => handleUploadThroughGroup(group.key)}
                            disabled={
                              bulkUploading ||
                              group.status === "done" ||
                              !group.files.some((item) => item.role === "normalBrstm")
                            }
                            title="一覧の先頭からこの曲までをアップロード"
                          >
                            この曲までアップロード
                          </button>

                          <button
                            className="secondaryButton"
                            type="button"
                            onClick={() => handleCancelBulkGroup(group.key)}
                            disabled={bulkUploading || group.status === "done"}
                            title="アップロード待機一覧から除外（登録済みデータは削除しません）"
                          >
                            この曲をキャンセル
                          </button>
                        </div>
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
          </div>
        </details>

        <details className="adminPanel wide adminCollapsiblePanel" id="admin-packs" open>
          <summary className="adminSectionSummary">
            <span className="adminSectionSummaryTitle">
              <span className="label">ZIP MUSIC PACK</span>
              <span className="adminTitle">ZIPパックを追加</span>
            </span>
            <span className="adminSectionChevron" aria-hidden="true" />
          </summary>
          <div className="adminSectionBody">

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
          </div>
        </details>

        <details className="adminPanel wide adminCollapsiblePanel" id="admin-missing-previews" open>
          <summary className="adminSectionSummary">
            <span className="adminSectionSummaryTitle">
              <span className="label">MISSING PREVIEWS</span>
              <span className="adminSubTitle">
                プレビュー未登録の曲
                <span className="adminSectionCount">{missingPreviewTracks.length}</span>
              </span>
            </span>
            <span className="adminSectionChevron" aria-hidden="true" />
          </summary>
          <div className="adminSectionBody">
            <input
              className="formInput adminMissingPreviewSearch"
              type="search"
              value={missingPreviewQuery}
              onChange={(event) => {
                setMissingPreviewQuery(event.target.value);
                setMissingPreviewLimit(50);
              }}
              placeholder="曲名・英語名・タグで検索"
              aria-label="プレビュー未登録の曲を検索"
            />

            {matchingMissingPreviews.length === 0 ? (
              <div className="empty">
                {missingPreviewQuery.trim()
                  ? "検索に一致する曲はありません。"
                  : "プレビュー未登録の曲はありません。"}
              </div>
            ) : (
              <>
                <div className="adminMissingPreviewList">
                  {matchingMissingPreviews.slice(0, missingPreviewLimit).map((track) => (
                    <div key={track.id} className="adminMissingPreviewRow">
                      <div className="adminMissingPreviewInfo">
                        <strong>{track.title}</strong>
                        {track.title_en && track.title_en !== track.title && (
                          <small>{track.title_en}</small>
                        )}
                        <div className="adminMissingPreviewStatus">
                          {getMissingTrackPreviews(track).map((item) => (
                            <span key={item} className="adminMissingPreviewTag">⚠️ {item}</span>
                          ))}
                        </div>
                      </div>
                      <button
                        className="secondaryButton"
                        type="button"
                        onClick={() => editMissingPreview(track)}
                      >
                        プレビューを登録
                      </button>
                    </div>
                  ))}
                </div>
                {matchingMissingPreviews.length > missingPreviewLimit && (
                  <button
                    className="secondaryButton adminMissingPreviewMore"
                    type="button"
                    onClick={() => setMissingPreviewLimit((count) => count + 50)}
                  >
                    さらに表示（{Math.min(missingPreviewLimit, matchingMissingPreviews.length)} / {matchingMissingPreviews.length}曲）
                  </button>
                )}
              </>
            )}
          </div>
        </details>

        <details className="adminPanel wide adminCollapsiblePanel" id="admin-tracks" open>
          <summary className="adminSectionSummary">
            <span className="adminSectionSummaryTitle">
              <span className="label">TRACK LIBRARY</span>
              <span className="adminSubTitle">登録済みの曲</span>
            </span>
            <span className="adminSectionChevron" aria-hidden="true" />
          </summary>
          <div className="adminSectionBody">

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
              <article className="adminTrackCard" key={track.id} id={`admin-track-${track.id}`}>
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
                        {!track.preview_url && !editPreviewFile && (
                          <span className="previewMissingInline" title="通常プレビューMP3未登録">⚠️ 未登録</span>
                        )}
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
                        {track.brstm_lap3_url && !track.preview_lap3_url && !editPreviewLap3File && (
                          <span className="previewMissingInline" title="Lap 3プレビューMP3未登録">⚠️ 未登録</span>
                        )}
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
                      <h3>
                        {track.title}
                        {getMissingTrackPreviews(track).length > 0 && (
                          <span
                            className="previewMissingInline"
                            role="img"
                            aria-label={getMissingTrackPreviews(track).join("・") + "が未登録"}
                            title={getMissingTrackPreviews(track).join("・") + "が未登録"}
                          >
                            ⚠️
                          </span>
                        )}
                      </h3>
                      <p>英語名: {track.title_en || track.title}</p>
                      <p>
                        {track.category} / {getLoopValue(track.loop_type)}
                      </p>
                      {track.tags && renderTags(track.tags)}
                      <p>
                        通常: {track.brstm_url ? "BRSTMあり" : "BRSTMなし"} / 通常プレビュー:{" "}
                        {track.preview_url ? "MP3あり" : track.brstm_url ? "⚠️ MP3なし" : "MP3なし"}
                      </p>
                      <p>
                        Lap 3: {track.brstm_lap3_url ? "BRSTMあり" : "BRSTMなし"} / Lap 3プレビュー:{" "}
                        {track.preview_lap3_url ? "MP3あり" : track.brstm_lap3_url ? "⚠️ MP3なし" : "MP3なし"}
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
          </div>
        </details>

        <details className="adminPanel wide adminCollapsiblePanel" id="admin-tags" open>
          <summary className="adminSectionSummary">
            <span className="adminSectionSummaryTitle">
              <span className="adminSubTitle">タグ管理</span>
            </span>
            <span className="adminSectionChevron" aria-hidden="true" />
          </summary>
          <div className="adminSectionBody">

          <p className="formMessage">タグの変更・削除は、すべての曲とPackに反映されます。</p>

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
            ) : null}
          </div>

          <div className="adminTagSortBar">
            <label className="formLabel">
              並べ替え
              <select
                className="formInput"
                value={tagSortMode}
                onChange={(event) => {
                  const mode = event.target.value as "alphabetical" | "newest" | "count";
                  setTagSortMode(mode);
                  setTagSortDirection(mode === "alphabetical" ? "asc" : "desc");
                }}
              >
                <option value="alphabetical">アルファベット順</option>
                <option value="newest">新しい順</option>
                <option value="count">登録が多い順</option>
              </select>
            </label>
            <label className="formLabel">
              順序
              <select
                className="formInput"
                value={tagSortDirection}
                onChange={(event) => setTagSortDirection(event.target.value as "asc" | "desc")}
              >
                <option value="asc">昇順</option>
                <option value="desc">降順</option>
              </select>
            </label>
            <span className="adminTagSortNote" title="新しい順の基準は、そのタグが付いた曲またはMusic Packの最新登録日時です。">
              {tagSortMode === "newest" ? "曲・Packの最新登録日を基準" : `${tagSuggestions.length}タグ`}
            </span>
          </div>

          <div className="adminTagList">
              {sortedManagementTags.map((tag) => (
                <div className="adminTagRow" key={tag}>
                  <label className="formLabel adminTagField">
                    日本語名
                    <input
                      className="formInput"
                      value={tagDrafts[tag] ?? tag}
                      onChange={(event) =>
                        setTagDrafts((current) => ({
                          ...current,
                          [tag]: event.target.value,
                        }))
                      }
                    />
                  </label>

                  <label className="formLabel adminTagField">
                    英語名
                    <input
                      className="formInput"
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
                      title="空欄の場合は日本語名を表示"
                    />
                  </label>

                  <div className="adminTagUsageCount">
                    {(() => {
                      const stats = tagManagementStats.get(tag.toLowerCase());
                      return stats
                        ? `${stats.count}件（曲 ${stats.trackCount}・Pack ${stats.packCount}）`
                        : "0件";
                    })()}
                  </div>
                  <button
                    className="secondaryButton adminTagButton"
                    type="button"
                    onClick={() => handleSaveTag(tag)}
                    title="日本語名・英語名を保存"
                  >
                    保存
                  </button>
                  <button
                    className="dangerButton adminTagButton"
                    type="button"
                    onClick={() => handleDeleteTag(tag)}
                    title="このタグをすべての曲とPackから削除"
                  >
                    削除
                  </button>
                </div>
              ))}
          </div>
          </div>
        </details>
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
