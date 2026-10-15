# Firebase Spark 公開手順

Kei Projects の静的ポータルだけをFirebase Hostingに公開する手順です。BRSTM Hub・Lounge Card・Item Counter・Course Stats本体は元のサービスから移動しません。

## 1. Firebase Sparkプロジェクトを作る

- [Firebase Console](https://console.firebase.google.com/) で新規プロジェクトを作成
- **Spark（無料）** のまま利用し、支払いアカウントを紐付けない
- プロジェクトIDをメモする（表示名ではない）
- Hosting を有効化する

Billing のアップグレード画面が出ても **Blaze を選択しない**。Firebase Hostingの静的公開にBlazeは不要です。

## 2. GitHubからFirebaseに接続する

[Firebase公式のGitHub連携ガイド](https://firebase.google.com/docs/hosting/github-integration) と [サービスアカウント設定](https://github.com/FirebaseExtended/action-hosting-deploy/blob/main/docs/service-account.md) を参照して、対象Firebaseプロジェクトの**デプロイ専用**サービスアカウントを作成します。

GitHubリポジトリ `MKW4life/kei-brstm-hub` の **Settings → Secrets and variables → Actions → New repository secret** で、

`FIREBASE_SERVICE_ACCOUNT_KEI_PROJECTS`

という名前のリポジトリシークレットに、発行したサービスアカウント JSON の内容を登録します。

**JSONの秘密鍵をChatGPTに送ったり、Gitにコミットしたりしないでください。** 必要な権限だけを付与してください。ワークフローは入力されたプロジェクトIDと資格情報内のプロジェクトIDが一致しないと中止します。

## 3. Previewだけを公開する

`.github/workflows/publish-kei-projects.yml` はGitHubのデフォルトブランチ（`main`）に入った後、GitHubの **Actions** から実行できます。

1. PR #1 をレビューする。**マージすると既存Vercelアプリ側の更新も走る場合がある** ため、公開前に差分を確認する
2. GitHub Actions で **Publish Kei Projects to Firebase Hosting** を選ぶ
3. **Run workflow** を開く
4. `firebase_project_id` にプロジェクトIDを入力
5. `destination` は **preview** のまま実行する

成功した場合は実行ログにプレビューURLが表示されます。プレビューは7日で期限切れになります。

## 4. 内容を確認しLiveで公開する

- PC・スマホのトップページを確認
- BRSTM Hub、Lounge Card、Item Counterがそれぞれ既存サイトへ302転送されることを確認
- Item CounterのOBS URL・Windowsホットキー・接続キーが変わっていないことを確認
- Course Statsの公開先が未確認の間、トップページにそのカードが表示されないことを確認

確認後、同じ Actions を `destination=live` として手動実行します。サイトは通常 `https://PROJECT_ID.web.app/` に公開されます。

## 5. 元のサービスから統合ホームへのリンクを有効化する

既存のBRSTM HubとLounge Cardの**Vercel側**で環境変数を設定します。

```text
NEXT_PUBLIC_KEI_PROJECTS_URL=https://PROJECT_ID.web.app/
```

その後Vercel側のデプロイを更新します。Item Counterの接続キーやAPI URLは変更しません。

MKW Course Statsの正しい公開URLを検証するまでは、`NEXT_PUBLIC_MKW_COURSE_STATS_URL` と `public/projects-config.js` の `courseStatsUrl` を空にします。後からURLを確認できたときだけ設定します。

## 注意

- GitHubのPRブランチだけでは手動ワークフローがActions一覧に表示されない場合があります。通常は `main` にマージしてから使います
- 現時点でこの手順によるFirebase公開は行っていません
- プレビューとLiveの配信量は同じFirebase Hostingプロジェクトの無料枠を使用します
- Hostingの無料枠を超えると制限される場合があります。課金を避けるにはSparkを維持し、利用量を確認してください
- `/stats` はまだCourse Stats本体ではありません。URLが未確認の間は戻るためのページを表示します
