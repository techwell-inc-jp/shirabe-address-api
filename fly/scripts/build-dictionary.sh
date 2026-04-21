#!/usr/bin/env bash
# Fly.io Volume 上の abr-geocoder 辞書を構築する
# Phase 1: 主要 6 都道府県(東京/神奈川/大阪/愛知/福岡/北海道)
#
# 実装指示書 §4.2 参照。abr-geocoder v2.2.1 の `abrg download` は
# 全国地方公共団体コード(6 桁、最終桁はチェックディジット)を `-c` で指定する。
#
# 想定実行環境: Fly.io マシン内(Volume /data/address-db マウント済み)
# GitHub Actions の deploy-fly.yml からも呼び出される。

set -euo pipefail

DB_DIR="${DB_DIR:-/data/address-db}"

# 全国地方公共団体コード(総務省)
# 参考: https://www.soumu.go.jp/denshijiti/code.html
LG_CODES=(
  "010006"  # 北海道
  "130001"  # 東京都
  "140007"  # 神奈川県
  "230006"  # 愛知県
  "270008"  # 大阪府
  "400009"  # 福岡県
)

echo "[build-dictionary] target dir : ${DB_DIR}"
echo "[build-dictionary] lg codes   : ${LG_CODES[*]}"

mkdir -p "${DB_DIR}/database" "${DB_DIR}/cache"

# abrg download は -d でデータディレクトリ、-c で lg_code を受け付ける(array、空白区切り)。
# Fly.io 上では /app に abr-geocoder が同梱されている想定(npm ci 済)。
npx --yes @digital-go-jp/abr-geocoder download \
  -d "${DB_DIR}" \
  -c "${LG_CODES[@]}" \
  --silent

echo "[build-dictionary] done"
