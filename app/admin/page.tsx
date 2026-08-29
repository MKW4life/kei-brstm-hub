"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import KeiProjectRail from "@/components/KeiProjectRail";

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
  status: "ready" | "uploading" | "done" | "error";
};

const categories = ["コースBGM", "その他BGM"];
const loopTypes = [
  { value: "loop", label: "Loop" },
  { value: "no", label: "No" },
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
        titleEn: item.baseName,
        category: "コースBGM",
        tags: "",
        loopType: "loop",
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
  const [editLoopType, setEditLoopType] = useState<"loop" | "no">("loop");
  const [editTags, setEditTags] = useState("");
  const [editIsPublished, setEditIsPublished] = useState(true);

  const [editBrstmFile, setEditBrstmFile] = useState<File | null>(null);
  const [editPreviewFile, setEditPreviewFile] = useState<File | null>(null);
  const [editBrstmLap3File, setEditBrstmLap3File] = useState<File | null>(null);
  const [editPreviewLap3File, setEditPreviewLap3File] =
    useState<File | null>(null);

  const [packTitle, setPackTitle] = useState("");
  const [packTags, setPackTags] = useState("");
  const [packYoutubeUrl, setPackYoutubeUrl] = useState("");
  const [packZipUrl, setPackZipUrl] = useState("");
  const [packPublished, setPackPublished] = useState(true);
  const [packSubmitting, setPackSubmitting] = useState(false);

  const tagSuggestions = useMemo(() => {
    const allTags = tracks.flatMap((track) =>
      (track.tags || "")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
    );

    return Array.from(new Set(allTags)).sort((a, b) => a.localeCompare(b));
  }, [tracks]);

  useEffect(() => {
    async function checkLogin() {
      const { data } = await supabase.auth.getUser();

      if (!data.user) {
        router.push("/admin/login");
        return;
      }

      setChecking(false);
      await Promise.all([loadTracks(), loadPacks()]);
    }

    checkLogin();
  }, [router]);

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

    setTracks((data as Track[]) ?? []);
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

    setPacks((data as MusicPack[]) ?? []);
  }

  async function uploadFile(bucket: string, file: File) {
    const filePath = safeFileName(file.name);

    const { error } = await supabase.storage.from(bucket).upload(filePath, file, {
      upsert: false,
    });

    if (error) throw error;

    const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
    return data.publicUrl;
  }

  async function removeStorageFile(bucket: string, publicUrl: string) {
    const filePath = getStoragePathFromPublicUrl(bucket, publicUrl);
    if (!filePath) return;

    const { error } = await supabase.storage.from(bucket).remove([filePath]);

    if (error) {
      console.warn(`Storage file delete failed: ${bucket}/${filePath}`, error);
    }
  }

  function handleBulkFiles(files: FileList | null) {
    if (!files) return;

    const groups = buildBulkGroups(Array.from(files));
    setBulkGroups(groups);

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
            return {
              ...group,
              files: [...group.files, movingFile],
            };
          }

          return group;
        })
        .filter((group) => group.files.length > 0);

      return next;
    });
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
        return "無視";
    }
  }

  async function handleBulkUpload() {
    if (bulkUploading) return;

    const validGroups = bulkGroups.filter((group) =>
      group.files.some((item) => item.role === "normalBrstm")
    );

    if (validGroups.length === 0) {
      setMessage("通常用BRSTMがある曲がありません。");
      return;
    }

    setBulkUploading(true);
    setMessage("一括アップロードを開始しました。");

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
          title_en: group.titleEn.trim() || group.title.trim(),
          source: "",
          category: group.category,
          slot_name: "",
          example_ct: "",
          loop_type: group.loopType,
          description: "",
          tags: group.tags,
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
      `一括登録完了: ${successCount}曲 / エラー: ${errorCount}曲。`
    );
    await loadTracks();
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
        tags: packTags,
        youtube_url: packYoutubeUrl.trim(),
        zip_url: packZipUrl.trim(),
        is_published: packPublished,
      });

      if (error) throw error;

      setPackTitle("");
      setPackTags("");
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
    setEditTags(track.tags ?? "");
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
        title_en: editTitleEn.trim() || editTitle.trim(),
        source: "",
        category: editCategory,
        slot_name: "",
        example_ct: "",
        loop_type: editLoopType,
        description: "",
        tags: editTags,
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

            <label className="formLabel">
              タグ
              <input
                className="formInput"
                value={packTags}
                onChange={(event) => setPackTags(event.target.value)}
              />
            </label>

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
              <div className="adminTrackList">
                {bulkGroups.map((group) => (
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

                      <label className="formLabel">
                        タグ
                        <input
                          className="formInput"
                          value={group.tags}
                          onChange={(event) =>
                            updateBulkGroup(group.key, {
                              tags: event.target.value,
                            })
                          }
                        />
                      </label>

                      {tagSuggestions.length > 0 && (
                        <div className="trackTags">
                          {tagSuggestions.map((tag) => (
                            <button
                              className="tag clickableTag"
                              type="button"
                              key={tag}
                              onClick={() => addSuggestedTagToGroup(group.key, tag)}
                            >
                              #{tag}
                            </button>
                          ))}
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
                                <option value="ignore">無視</option>
                              </select>
                            </label>
                          </div>
                        ))}
                      </div>

                      <div className="trackMeta" style={{ marginTop: "10px" }}>
                        <span>Status: {group.status}</span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>

              <button
                className="primaryButton fullButton"
                type="button"
                onClick={handleBulkUpload}
                disabled={bulkUploading}
              >
                {bulkUploading
                  ? "まとめてアップロード中..."
                  : `${bulkGroups.filter((group) =>
                      group.files.some((item) => item.role === "normalBrstm")
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

          <div className="adminTrackList">
            {tracks.map((track) => (
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

                    <label className="formLabel">
                      タグ
                      <input
                        className="formInput"
                        value={editTags}
                        onChange={(event) => setEditTags(event.target.value)}
                      />
                    </label>

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

            {tracks.length === 0 && (
              <div className="empty">登録済みの曲はありません。</div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
