#!/usr/bin/env bash
# Fly.io Volume 上の abr-geocoder 辞書を構築する(全国フル辞書)
#
# ## なぜ全国フルダウンロードか
#
# 初回は prefecture-level の LG code 6 つ(010006/130001/140007/230006/270008/400009)を
# `-c` で指定して絞り込んだが、E2E 検証(2026-04-21)で oaza_cho Trie キャッシュが
# 6 都道府県中 5 つで空(73 byte スタブ)になる不具合を観測:
#
#   /data/address-db/cache/oaza-cho_e15f2079_{010006,130001,140007,230006,270008}.abrg2
#     → いずれも 73 bytes(Trie ヘッダーのみ、町字ノード 0 件)
#   /data/address-db/cache/oaza-cho_e15f2079_400009.abrg2
#     → 2.0 MB(福岡のみ正常)
#
# 結果、「東京都港区六本木6-10-1」などが level 2(市区町村)止まりで止まり、
# 町字・街区・住居表示が resolve できなかった。abr-geocoder v2.2.1 で
# prefecture-level LG code を `-c` に渡すと、parcel データは municipal
# 単位で展開されるが、oaza_cho Trie 構築は prefecture entity 自体の町字
# (空集合)しか拾わない挙動がある模様。
#
# ## 対処
#
# `-c` を外して全国フル辞書をダウンロードする。サイズ見積もり:
# - raw CSV: ~5-8 GB
# - SQLite: ~3-5 GB
# - 初回構築: 2-3 時間(Fly Machine performance-1x、NRT)
# - Volume `address_db` 10 GB 内に収まる想定
#
# Workers 側の `PHASE_1_COVERAGE` は 6 都道府県のまま維持されるため、
# API は Phase 1 の宣言どおり 6 都道府県のみを公開する。辞書 > 公開範囲の
# 構成は Phase 2 展開時に coverage.ts 1 ファイルの変更で解禁できる。
#
# ## 実行環境
#
# - Fly.io マシン内(Volume /data/address-db マウント済み)
# - SSH: `flyctl ssh console -a shirabe-address-api` → `bash /app/scripts/build-dictionary.sh`
# - GitHub Actions の deploy-fly.yml 経由では **実行しない**(デプロイ時に辞書を
#   自動構築するとコストとデプロイ時間が爆発するため、手動オペレーションのまま)

set -euo pipefail

DB_DIR="${DB_DIR:-/data/address-db}"

echo "[build-dictionary] target dir : ${DB_DIR}"
echo "[build-dictionary] mode       : full nationwide download (-c not specified)"

mkdir -p "${DB_DIR}/database" "${DB_DIR}/cache"

# abrg download は -d でデータディレクトリを受け付ける。`-c` 無しで全国フル辞書。
# Fly.io 上では /app に abr-geocoder が同梱されている想定(npm ci 済)。
npx --yes @digital-go-jp/abr-geocoder download \
  -d "${DB_DIR}" \
  --silent

echo "[build-dictionary] done"
