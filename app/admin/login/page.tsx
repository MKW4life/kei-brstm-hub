"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function AdminLoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSubmitting(true);
    setMessage("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setMessage(
        "ログインできませんでした。メールアドレスとパスワードを確認してください。"
      );
      setSubmitting(false);
      return;
    }

    router.push("/admin");
  }

  return (
    <div className="page">
      <header className="header">
        <div className="headerInner">
          <a className="logoArea linkLogo" href="/">
            <div className="logo">♫</div>
            <span>Kei BRSTM Hub</span>
          </a>
        </div>
      </header>

      <main className="main">
        <section className="adminPanel">
          <p className="label">ADMIN LOGIN</p>
          <h1 className="adminTitle">管理者ログイン</h1>
          <p className="adminText">
            曲の追加・編集・削除は管理者のみ行えます。
          </p>

          <form className="adminForm" onSubmit={handleLogin}>
            <label className="formLabel">
              メールアドレス
              <input
                className="formInput"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>

            <label className="formLabel">
              パスワード
              <input
                className="formInput"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>

            {message && <p className="formMessage">{message}</p>}

            <button
              className="primaryButton fullButton"
              type="submit"
              disabled={submitting}
            >
              {submitting ? "ログイン中..." : "ログイン"}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}