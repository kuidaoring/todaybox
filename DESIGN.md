# Hono + Electron Todo (Minimal)

## 前提
- Electron がローカルで Hono サーバを起動し、`BrowserWindow` から `http://localhost` を表示する。
- データはメモリ保持（永続化なし）。
- 画面は 1 画面（一覧 + 追加 + 完了トグル + 削除）。
- 認証なし、1ユーザー前提。

## 要件（最小）
- Todo の追加
- Todo の完了/未完了の切り替え
- Todo の削除
- 一覧表示（作成順）
- 画面は Hono の JSX renderer でサーバ側レンダリング
- Electron から起動できる（ローカルサーバ）

## 設計（最小構成）
### プロセス構成
- Electron main: Hono サーバ起動 -> `BrowserWindow` で `http://localhost:<port>` を表示

### ルーティング
- `GET /` 一覧表示（JSX）
- `POST /todos` 追加
- `POST /todos/:id/toggle` 完了切替
- `POST /todos/:id/delete` 削除

### データモデル（メモリ）
- `Todo { id: string; title: string; completed: boolean; createdAt: number }`
- `todos: Todo[]`

### JSX レンダリング
- `jsxRenderer` を使って `Layout` と `TodoList` を返却
- フォームは `method="post"` のシンプルな HTML

### UI（最小）
- テキスト入力 + 追加ボタン
- 未完了/完了でスタイル差（例: 取り消し線）
- 各行に「完了/未完了」「削除」ボタン
