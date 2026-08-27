#!/bin/bash
set -e

cd "$(dirname "$0")"

# Use the project's bundled ONNX Runtime 1.28.0.
export ORT_LIB_PATH="$PWD/onnxruntime"
export ORT_PREFER_DYNAMIC_LINK=1

echo "=== Building snapshot-sensors-yolo ==="
echo "ORT_LIB_PATH=$ORT_LIB_PATH"
echo "ORT_PREFER_DYNAMIC_LINK=$ORT_PREFER_DYNAMIC_LINK"
echo

cargo build --release

echo
echo "=== ONNX Runtime linkage ==="
ldd target/release/snapshot-sensors-yolo | grep -i onnx || true

echo
echo "=== Build complete ==="
echo "Binary:"
echo "  $PWD/target/release/snapshot-sensors-yolo"
