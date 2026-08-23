# homebridge-snapshot-sensors

[![CI](https://github.com/mrfatboy/homebridge-snapshot-sensors/actions/workflows/ci.yml/badge.svg)](https://github.com/mrfatboy/homebridge-snapshot-sensors/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/homebridge-snapshot-sensors)](https://www.npmjs.com/package/homebridge-snapshot-sensors)
[![npm downloads](https://img.shields.io/npm/dt/homebridge-snapshot-sensors)](https://www.npmjs.com/package/homebridge-snapshot-sensors)
[![GitHub stars](https://img.shields.io/github/stars/mrfatboy/homebridge-snapshot-sensors?style=flat)](https://github.com/mrfatboy/homebridge-snapshot-sensors/stargazers)
[![license](https://img.shields.io/npm/l/homebridge-snapshot-sensors)](./LICENSE)

**Retrieve camera snapshots and run local YOLO object detection for `🐶 Animals`, `📦 Packages`, `🧍 People`, and `🚗 Vehicles`.**

## About this project

**homebridge-snapshot-sensors is a separately developed and maintained Snapshot Sensors project.** The implementation uses direct camera snapshot URLs and an on-device YOLO model; the previous video-processing architecture has been removed.

## Installation

### Homebridge UI

1. Open the **Plugins** tab in the Homebridge UI.
2. Search for `homebridge-snapshot-sensors`.
3. Click **Install**.

### Command line

```bash
npm install -g homebridge-snapshot-sensors
```

## Configuration

### Homebridge UI

Configure the plugin from the Homebridge settings form.
1. Add a **snapshot**.
2. Enter the camera's still-image URL.
3. Configure the detection categories.
4. Click **Save**.

### Manual (`config.json`)

Add a `SnapshotSensors` platform to your Homebridge config. Each snapshot source has one or more sensor definitions.

```json
{
  "platforms": [
    {
      "platform": "SnapshotSensors",
      "snapshots": [
        {
          "name": "Front Door",
          "url": "http://192.168.1.50/cgi-bin/snapshot.cgi",
          "sensors": [
            { "categories": ["people", "packages"] },
            { "categories": ["vehicles"], "threshold": 0.6 }
          ]
        }
      ]
    }
  ]
}
```

- **`name`** — snapshot source name and prefix for auto-named sensors.
- **`url`** — direct URL that returns a still image from the camera.
- **`categories`** — one or more of `animals`, `packages`, `people`, `vehicles`.
- **`threshold`** *(optional)* — detection confidence from 0–1.
- **`storeSnapshots`** — `never`, `normal`, or `annotated`.
- **`snapshotDirectory`** — required when storing snapshots.
- **`snapshotPrefix`** — optional prefix for stored image filenames.

## Camera setup

Use the camera's native still-image/snapshot endpoint. The exact URL depends on the camera manufacturer and model. Consult the camera documentation for its snapshot API.

## Requirements

- **Homebridge** v1.8 or newer
- **Node.js** v20 or newer
- A camera endpoint that returns a still image
- Enough CPU headroom for local YOLO inference

The object detector uses the bundled native YOLO runner and ONNX Runtime. Detection is performed locally in the Homebridge environment; images are not uploaded to a cloud service.

### Supported platforms

The on-device detector uses native ONNX Runtime binaries for supported 64-bit macOS, Linux, and Windows platforms.

## Troubleshooting

- **Snapshot retrieval fails** — verify the URL, credentials, and that the camera is reachable from the Homebridge host.
- **Detections are missed** — lower the configured detection threshold or ensure the subject is sufficiently visible in the image.
- **Too many false detections** — raise the detection threshold.
- **Homebridge feels sluggish** — local object detection is CPU-intensive. Consider reducing the number of configured snapshot sources or detection frequency in the implementation as the project evolves.

## License

Licensed under **AGPL-3.0-only** — free to use, study, and build on. Contributions and forks are welcome; please keep them under the same license terms.
