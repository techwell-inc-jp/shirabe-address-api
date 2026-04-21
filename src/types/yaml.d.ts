/**
 * `*.yaml` をテキストモジュールとして import するための型宣言。
 *
 * Cloudflare Workers (Wrangler) の `[[rules]] type = "Text"` 設定と対になり、
 * バンドル時に YAML ファイルの内容が文字列として default export される。
 * Vitest 実行時は vitest.config.ts の yamlAsText プラグインで同等変換を行う。
 */
declare module "*.yaml" {
  const content: string;
  export default content;
}
