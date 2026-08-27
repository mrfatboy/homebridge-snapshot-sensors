# Changelog

All notable changes to `homebridge-snapshot-sensors` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Per-message notification sounds for supported notification providers.

### Changed

- Notification sound configuration is now associated with each notification message type instead of using one global sound setting.

## [1.0.1] - 2026-08-26

### Added

- Native YOLO26 object detection with prebuilt ONNX Runtime support.
- Pushover and Push Safer notification providers.
- ntfy notification provider.
- Configurable notification messages by detection category.
- Optional development test-image support through `SNAPSHOT_SENSORS_TEST_IMAGE`.

### Changed

- Improved native YOLO detection field handling and category matching.
- YOLO detection diagnostics can be enabled through the development test-image environment variable.

[Unreleased]: https://github.com/mrfatboy/homebridge-snapshot-sensors/compare/main...NewFeature
[1.0.1]: https://github.com/mrfatboy/homebridge-snapshot-sensors/releases/tag/v1.0.1
