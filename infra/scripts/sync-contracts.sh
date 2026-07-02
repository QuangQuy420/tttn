#!/bin/bash
# Copies a published OpenAPI contract from infra/contracts/ into a consuming
# service's own contracts/ folder — the "versioned copy" mechanism decided in
# infra/docs/adr/0001-contract-sharing-mechanism.md (NOT a git submodule, NOT a
# live/linked reference). Run this deliberately whenever a consumer wants to pick
# up a contract change; nothing runs it automatically on build.
#
# Usage:
#   infra/scripts/sync-contracts.sh [contract-name] [consumer-repo]
#
# Examples:
#   infra/scripts/sync-contracts.sh
#     -> copies contracts/product-service.openapi.yaml into
#        ../recommendation-service/contracts/ (the default demo consumer)
#   infra/scripts/sync-contracts.sh product-service ../web
#     -> copies the same file into ../web/contracts/ instead
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTRACTS_DIR="$SCRIPT_DIR/../contracts"

CONTRACT_NAME="${1:-product-service}"
CONSUMER_REPO="${2:-$SCRIPT_DIR/../../recommendation-service}"

SOURCE_FILE="$CONTRACTS_DIR/${CONTRACT_NAME}.openapi.yaml"
TARGET_DIR="$CONSUMER_REPO/contracts"

if [ ! -f "$SOURCE_FILE" ]; then
  echo "error: no published contract at $SOURCE_FILE" >&2
  exit 1
fi

mkdir -p "$TARGET_DIR"
cp -v "$SOURCE_FILE" "$TARGET_DIR/${CONTRACT_NAME}.openapi.yaml"

echo "Synced $(basename "$SOURCE_FILE") -> $TARGET_DIR/ (point-in-time copy — re-run after the producer changes the contract)"
