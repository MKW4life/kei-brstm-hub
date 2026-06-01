"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Track = {
  id: number;
  title: string;
  title_en: string;
  category: string;
  example_ct: string;
  description: string;
  tags: string;
  brstm_url: string;
  preview_url: string;
  brstm_lap3_url: string;
  preview_lap3_url: string;
  download_count: number;
  is_published: boolean;
  created_at: string;
};

const categories = ["コースBGM", "その他BGM"];

function safeFileName(fileName: string) {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  const baseName = fileName
    .replace(/\.[^/.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return `${Date.now()}_${baseName || "file"}.${extension}`;
}

export default function AdminPage() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editing, setEditing] = useState(false);

  const [title, setTitle] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [category, setCategory] = useState("コースBGM");
  const [exampleCt, setExampleCt] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [isPublished, setIsPublished] = useState(true);

  const [brstmFile, setBrstmFile] = useState<File | null>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [brstmLap3File, setBrstmLap3File] = useState<File | null>(null);
  const [previewLap3File, setPreviewLap3File] = useState<File | null>(null);

  const [editingTrackId, setEditingTrackId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editTitleEn, setEditTitleEn] = useState("");
  const [editCategory, setEditCategory] = useState("コースBGM");
  const [editExampleCt, setEditExampleCt] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editTags, setEditTags] = useState("");
  const [editIsPublished, setEditIsPublished] = useState(true);

  useEffect(() => {
    async function checkLogin() {
      const { data } = await supabase.auth.getUser();

      if (!data.user) {
        router.push("/admin/login");
        return;
      }

      setChecking(false);
      await loadTracks();
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
        example_ct,
        description,
        tags,
        brstm_url,
        preview_url,
        brstm_lap3_url,
        preview_lap3_url,
        download_count,
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

  async function uploadFile(bucket: string, file: File) {
    const filePath = safeFileName(file.name);

    const { error } = await supabase.storage.from(bucket).upload(filePath, file, {
      upsert: false,
    });

    if (error) {
      throw error;
    }

    const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);

    return data.publicUrl;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setMessage("");

    if (!title.trim()) {
      setMessage("日本語曲名を入力してください。");
      return;
    }

    if (!brstmFile) {
      setMessage("通常用 .brstm ファイルを選択してください。");
      return;
    }

    setSubmitting(true);

    try {
      const brstmUrl = await uploadFile("brstm-files", brstmFile);

      const previewUrl = previewFile
        ? await uploadFile("previews", previewFile)
        : "";

      const brstmLap3Url = brstmLap3File
        ? await uploadFile("brstm-files", brstmLap3File)
        : "";

      const previewLap3Url = previewLap3File
        ? await uploadFile("previews", previewLap3File)
        : "";

      const { error } = await supabase.from("tracks").insert({
        title: title.trim(),
        title_en: titleEn.trim() || title.trim(),
        source: "",
        category,
        slot_name: "",
        example_ct: exampleCt,
        description,
        tags,
        brstm_url: brstmUrl,
        preview_url: previewUrl,
        brstm_lap3_url: brstmLap3Url,
        preview_lap3_url: previewLap3Url,
        is_published: isPublished,
      });

      if (error) {
        throw error;
      }

      setTitle("");
      setTitleEn("");
      setCategory("コースBGM");
      setExampleCt("");
      setDescription("");
      setTags("");
      setIsPublished(true);
      setBrstmFile(null);
      setPreviewFile(null);
      setBrstmLap3File(null);
      setPreviewLap3File(null);
      setMessage("曲を追加しました。");

      const inputIds = [
        "brstmFile",
        "previewFile",
        "brstmLap3File",
        "previewLap3File",
      ];

      for (const id of inputIds) {
        const input = document.getElementById(id) as HTMLInputElement | null;
        if (input) input.value = "";
      }

      await loadTracks();
    } catch (error) {
      console.error(error);
      setMessage(
        "追加に失敗しました。Supabaseの権限設定やファイル形式を確認してください。"
      );
    }

    setSubmitting(false);
  }

  function startEdit(track: Track) {
    setMessage("");
    setEditingTrackId(track.id);
    setEditTitle(track.title ?? "");
    setEditTitleEn(track.title_en || track.title || "");
    setEditCategory(track.category ?? "コースBGM");
    setEditExampleCt(track.example_ct ?? "");
    setEditDescription(track.description ?? "");
    setEditTags(track.tags ?? "");
    setEditIsPublished(track.is_published);
  }

  function cancelEdit() {
    setEditingTrackId(null);
    setEditTitle("");
    setEditTitleEn("");
    setEditCategory("コースBGM");
    setEditExampleCt("");
    setEditDescription("");
    setEditTags("");
    setEditIsPublished(true);
  }

  async function handleEditSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (editingTrackId === null) {
      return;
    }

    if (!editTitle.trim()) {
      setMessage("日本語曲名を入力してください。");
      return;
    }

    setEditing(true);
    setMessage("");

    const { error } = await supabase
      .from("tracks")
      .update({
        title: editTitle.trim(),
        title_en: editTitleEn.trim() || editTitle.trim(),
        source: "",
        category: editCategory,
        slot_name: "",
        example_ct: editExampleCt,
        description: editDescription,
        tags: editTags,
        is_published: editIsPublished,
      })
      .eq("id", editingTrackId);

    if (error) {
      console.error(error);
      setMessage("編集内容の保存に失敗しました。");
      setEditing(false);
      return;
    }

    setMessage("編集内容を保存しました。");
    cancelEdit();
    await loadTracks();
    setEditing(false);
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
    const ok = window.confirm(`${track.title} を削除しますか？`);
    if (!ok) return;

    const { error } = await supabase.from("tracks").delete().eq("id", track.id);

    if (error) {
      console.error(error);
      setMessage("削除に失敗しました。");
      return;
    }

    setMessage("削除しました。");
    await loadTracks();
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/");
  }

  function handleBrstmChange(event: ChangeEvent<HTMLInputElement>) {
    setBrstmFile(event.target.files?.[0] ?? null);
  }

  function handlePreviewChange(event: ChangeEvent<HTMLInputElement>) {
    setPreviewFile(event.target.files?.[0] ?? null);
  }

  function handleBrstmLap3Change(event: ChangeEvent<HTMLInputElement>) {
    setBrstmLap3File(event.target.files?.[0] ?? null);
  }

  function handlePreviewLap3Change(event: ChangeEvent<HTMLInputElement>) {
    setPreviewLap3File(event.target.files?.[0] ?? null);
  }

  function renderTags(trackTags: string) {
    const tagList = trackTags
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    if (tagList.length === 0) {
      return null;
    }

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
          <p className="label">ADMIN</p>
          <h1 className="adminTitle">曲を追加</h1>

          <form className="adminForm" onSubmit={handleSubmit}>
            <div className="formGrid">
              <label className="formLabel">
                日本語曲名
                <input
                  className="formInput"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  required
                />
              </label>

              <label className="formLabel">
                英語曲名
                <input
                  className="formInput"
                  value={titleEn}
                  onChange={(event) => setTitleEn(event.target.value)}
                  placeholder="空欄の場合は日本語曲名と同じ"
                />
              </label>

              <label className="formLabel">
                カテゴリ
                <select
                  className="formInput"
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                >
                  {categories.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>

              <label className="formLabel">
                使用例
                <input
                  className="formInput"
                  value={exampleCt}
                  onChange={(event) => setExampleCt(event.target.value)}
                  placeholder="例: Rainbow Road / Aquania"
                />
              </label>

              <label className="formLabel checkboxLabel">
                <input
                  type="checkbox"
                  checked={isPublished}
                  onChange={(event) => setIsPublished(event.target.checked)}
                />
                公開する
              </label>
            </div>

            <label className="formLabel">
              説明
              <textarea
                className="formTextarea"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="ループ情報、差し替え先、注意点など"
              />
            </label>

            <label className="formLabel">
              タグ
              <input
                className="formInput"
                value={tags}
                onChange={(event) => setTags(event.target.value)}
                placeholder="例: Wii, Rainbow Road, 激しい, ラストラップ"
              />
            </label>

            <div className="formGrid">
              <label className="formLabel">
                通常用 BRSTM
                <input
                  id="brstmFile"
                  className="formInput"
                  type="file"
                  accept=".brstm"
                  onChange={handleBrstmChange}
                  required
                />
              </label>

              <label className="formLabel">
                通常用プレビュー音源
                <input
                  id="previewFile"
                  className="formInput"
                  type="file"
                  accept=".wav,.mp3,.ogg"
                  onChange={handlePreviewChange}
                />
              </label>

              <label className="formLabel">
                Lap 3用 BRSTM
                <input
                  id="brstmLap3File"
                  className="formInput"
                  type="file"
                  accept=".brstm"
                  onChange={handleBrstmLap3Change}
                />
              </label>

              <label className="formLabel">
                Lap 3用プレビュー音源
                <input
                  id="previewLap3File"
                  className="formInput"
                  type="file"
                  accept=".wav,.mp3,.ogg"
                  onChange={handlePreviewLap3Change}
                />
              </label>
            </div>

            {message && <p className="formMessage">{message}</p>}

            <button
              className="primaryButton fullButton"
              type="submit"
              disabled={submitting}
            >
              {submitting ? "追加中..." : "曲を追加する"}
            </button>
          </form>
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
                          placeholder="空欄の場合は日本語曲名と同じ"
                        />
                      </label>

                      <label className="formLabel">
                        カテゴリ
                        <select
                          className="formInput"
                          value={editCategory}
                          onChange={(event) =>
                            setEditCategory(event.target.value)
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
                        使用例
                        <input
                          className="formInput"
                          value={editExampleCt}
                          onChange={(event) =>
                            setEditExampleCt(event.target.value)
                          }
                        />
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
                      説明
                      <textarea
                        className="formTextarea"
                        value={editDescription}
                        onChange={(event) =>
                          setEditDescription(event.target.value)
                        }
                      />
                    </label>

                    <label className="formLabel">
                      タグ
                      <input
                        className="formInput"
                        value={editTags}
                        onChange={(event) => setEditTags(event.target.value)}
                        placeholder="例: Wii, Rainbow Road, 激しい, ラストラップ"
                      />
                    </label>

                    <div className="adminActions">
                      <button
                        className="primaryButton"
                        type="submit"
                        disabled={editing}
                      >
                        {editing ? "保存中..." : "保存する"}
                      </button>

                      <button
                        className="secondaryButton"
                        type="button"
                        onClick={cancelEdit}
                        disabled={editing}
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
                        {track.category} / 使用例: {track.example_ct || "-"}
                      </p>

                      {track.tags && renderTags(track.tags)}

                      <p>
                        通常: {track.brstm_url ? "BRSTMあり" : "BRSTMなし"} /{" "}
                        Lap 3:{" "}
                        {track.brstm_lap3_url ? "BRSTMあり" : "BRSTMなし"}
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