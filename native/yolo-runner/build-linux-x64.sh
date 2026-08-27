#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"

OUTPUT_DIR="bin/linux-x64"
BINARY="target/release/snapshot-sensors-yolo"
ORT_LIB="target/release/libonnxruntime.so"

echo "=== Building snapshot-sensors-yolo for Linux x64 ==="
echo

RUSTFLAGS='-C link-arg=-Wl,-rpath,\$ORIGIN' cargo build --release

echo
echo "=== Staging Linux x64 bundle ==="

mkdir -p "$OUTPUT_DIR"

cp "$BINARY" "$OUTPUT_DIR/snapshot-sensors-yolo"
cp "$ORT_LIB" "$OUTPUT_DIR/libonnxruntime.so"

chmod +x "$OUTPUT_DIR/snapshot-sensors-yolo"

echo
echo "=== Build complete ==="
echo "Linux x64 bundle:"
echo "  $PWD/$OUTPUT_DIR/snapshot-sensors-yolo"
echo "  $PWD/$OUTPUT_DIR/libonnxruntime.so"
