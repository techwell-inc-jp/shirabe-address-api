#!/usr/bin/env bash
# Fly.io Volume 上の abr-geocoder 辞書を構築する
# Phase 1: 東京都・神奈川県・大阪府・愛知県・福岡県・北海道 の 6 都道府県のみ
#
# 実装指示書 §4.2 参照。GitHub Actions の deploy-fly.yml から呼ばれる想定。
#
# 想定実行環境: Fly.io マシン内(Volume /data/address-db マウント済み)

set -euo pipefail

DB_DIR="${DB_DIR:-/data/address-db}"
PREFS=(
  "東京都"
  "神奈川県"
  "大阪府"
  "愛知県"
  "福岡県"
  "北海道"
)

echo "[build-dictionary] target dir: ${DB_DIR}"
echo "[build-dictionary] prefectures: ${PREFS[*]}"

mkdir -p "${DB_DIR}"

# TODO(4/24): abrg CLI の正確なフラグ名を v2.5.1 ドキュメントで確認
# ドライラン(コマンドは future ステップで有効化)
echo "[build-dictionary] would run:"
echo "  npx @digital-go-jp/abr-geocoder download -d ${DB_DIR} --pref ${PREFS[*]}"

echo "[build-dictionary] done (dry-run)"
