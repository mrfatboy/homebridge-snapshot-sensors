#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"

echo "=== Building snapshot-sensors-yolo ==="
echo "ONNX Runtime is downloaded and bundled by ort during the build."
echo

cargo build --release

echo
echo "=== Build complete ==="
echo "Binary:"
echo "  $PWD/target/release/snapshot-sensors-yolo"
echo
echo "The release workflow stages the matching ONNX Runtime library with the binary."
