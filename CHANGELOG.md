# Changelog

All notable changes to `homebridge-snapshot-sensors` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.0.6] - 2026-09-02

### Performance

- Deferred annotated snapshot generation until after sensor matching so unnecessary image compositing and JPEG encoding are avoided.
- Resolved each YOLO detection's Snapshot Sensor category once and reused it throughout detection matching and notification processing.
- Cached snapshot ownership UID/GID resolution to avoid repeated `getent` process launches for the same ownership setting.

## [1.0.5] - 2026-09-01

### Added

- Added **Unidentified Motion Activity ⚠️** as an optional fallback notification when YOLO detects objects that do not match any selected Animal, Person, or Vehicle category. Matching selected-category detections take priority.

## [1.0.4] - 2026-08-29

### Changed

- Improved annotated detection labels by moving them outside bounding boxes and adding a background panel for better visibility.

### Fixed

- Fixed the Homebridge UI plugin display name to consistently use **Homebridge Snapshot Sensors**.

## [1.0.3] - 2026-08-28

### Changed

- Replaced the custom Rust YOLO runtime with Node.js ONNX Runtime.
- Switched image processing and detection annotation to Sharp.
- Updated detection filtering to use the user-defined Animal, Person, and Vehicle confidence thresholds.
- Enabled cross-platform compatibility through Node.js ONNX Runtime.

### Removed

- Removed the obsolete custom Rust YOLO runtime, bundled ONNX Runtime libraries, and native build workflow.

## [1.0.2] - 2026-08-27

### Added

- Added individual notification sound settings for supported push notification messages.
- Added test notification support for ntfy and Push Safer.
- Improved YOLO26 detection reliability and native runtime handling.

### Fixed

- Fixed the Pushover test notification to use the standard Pushover sound.
- Fixed Linux ONNX Runtime loading for the bundled YOLO detection runner.

## [1.0.1] - 2026-08-26

### Added

- Native YOLO26 object detection with prebuilt ONNX Runtime support.
- Pushover and Push Safer notification providers.
- PushCut notification provider.
- ntfy notification provider.
- Configurable notification messages by detection category.

### Changed

- Improved native YOLO detection field handling and category matching.

## [1.0.0] - 2026-08-25

### Added

- Initial release of `homebridge-snapshot-sensors`.
- Camera snapshot retrieval from configured snapshot URLs.
- Local object detection using the bundled native YOLO/ONNX Runtime engine.
- HomeKit-compatible Snapshot Sensor switches.
- Configurable detection categories for animals, people, and vehicles.
- Per-sensor detection confidence thresholds.
- Optional original and annotated snapshot storage.
- Configurable snapshot directory and filename prefix.
- Support for multiple independent Snapshot Sensor configurations.
- Homebridge custom configuration UI.

[Unreleased]: https://github.com/mrfatboy/homebridge-snapshot-sensors/compare/main...NewFeature
[1.0.6]: https://github.com/mrfatboy/homebridge-snapshot-sensors/releases/tag/v1.0.6
[1.0.5]: https://github.com/mrfatboy/homebridge-snapshot-sensors/releases/tag/v1.0.5
[1.0.4]: https://github.com/mrfatboy/homebridge-snapshot-sensors/releases/tag/v1.0.4
[1.0.3]: https://github.com/mrfatboy/homebridge-snapshot-sensors/releases/tag/v1.0.3
[1.0.2]: https://github.com/mrfatboy/homebridge-snapshot-sensors/releases/tag/v1.0.2
[1.0.1]: https://github.com/mrfatboy/homebridge-snapshot-sensors/releases/tag/v1.0.1
[1.0.0]: https://github.com/mrfatboy/homebridge-snapshot-sensors/releases/tag/v1.0.0
