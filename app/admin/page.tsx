"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
  is_published: boolean;
  created_at: string;
};

const categories = ["Wiiコース", "レトロコース", "バトルコース", "その他BGM"];

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

  const [title, setTitle] = useState("");
  const [source, setSource] = useState("");
  const [category, setCategory] = useState("Wiiコース");
  const [slotName, setSlotName] = useState("");
  const [exampleCt, setExampleCt] = useState("");
  const [description, setDescription] = useState("");
  const [isPublished, setIsPublished] = useState(true);
  const [brstmFile, setBrstmFile] = useState<File | null>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);

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
      .select("*")
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
      setMessage("曲名を入力してください。");
      return;
    }

    if (!brstmFile) {
      setMessage(".brstm ファイルを選択してください。");
      return;
    }

    setSubmitting(true);

    try {
      const brstmUrl = await uploadFile("brstm-files", brstmFile);
      const previewUrl = previewFile
        ? await uploadFile("previews", previewFile)
        : "";

      const { error } = await supabase.from("tracks").insert({
        title,
        source,
        category,
        slot_name: slotName,
        example_ct: exampleCt,
        description,
        brstm_url: brstmUrl,
        preview_url: previewUrl,
        is_published: isPublished,
      });

      if (error) {
        throw error;
      }

      setTitle("");
      setSource("");
      setCategory("Wiiコース");
      setSlotName("");
      setExampleCt("");
      setDescription("");
      setIsPublished(true);
      setBrstmFile(null);
      setPreviewFile(null);
      setMessage("曲を追加しました。");

      const brstmInput = document.getElementById(
        "brstmFile"
      ) as HTMLInputElement | null;
      const previewInput = document.getElementById(
        "previewFile"
      ) as HTMLInputElement | null;

      if (brstmInput) brstmInput.value = "";
      if (previewInput) previewInput.value = "";

      await loadTracks();
    } catch (error) {
      console.error(error);
      setMessage(
        "追加に失敗しました。Supabaseの権限設定やファイル形式を確認してください。"
      );
    }

    setSubmitting(false);
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
          <a className="logoArea linkLogo" href="/">
            <div className="logo">♫</div>
            <span>Kei BRSTM Hub</span>
          </a>

          <div className="headerButtons">
            <a className="secondaryButton linkButton" href="/">
              サイトを見る
            </a>
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
                曲名
                <input
                  className="formInput"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  required
                />
              </label>

              <label className="formLabel">
                出典・作者
                <input
                  className="formInput"
                  value={source}
                  onChange={(event) => setSource(event.target.value)}
                  placeholder="Original / Kei"
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
                対応スロット
                <input
                  className="formInput"
                  value={slotName}
                  onChange={(event) => setSlotName(event.target.value)}
                  placeholder="ココナッツモール"
                />
              </label>

              <label className="formLabel">
                使用例CT
                <input
                  className="formInput"
                  value={exampleCt}
                  onChange={(event) => setExampleCt(event.target.value)}
                  placeholder="Aquania"
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

            <div className="formGrid">
              <label className="formLabel">
                BRSTMファイル
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
                プレビュー音源
                <input
                  id="previewFile"
                  className="formInput"
                  type="file"
                  accept=".wav,.mp3,.ogg"
                  onChange={handlePreviewChange}
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
                <div>
                  <h3>{track.title}</h3>
                  <p>{track.source || "-"}</p>
                  <p>
                    {track.category} / {track.slot_name || "-"} /{" "}
                    {track.example_ct || "-"}
                  </p>
                  <p>{track.is_published ? "公開中" : "非公開"}</p>
                </div>

                <div className="adminActions">
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