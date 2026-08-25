# homebridge-snapshot-sensors

[![CI](https://github.com/mrfatboy/homebridge-snapshot-sensors/actions/workflows/ci.yml/badge.svg)](https://github.com/mrfatboy/homebridge-snapshot-sensors/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/homebridge-snapshot-sensors)](https://www.npmjs.com/package/homebridge-snapshot-sensors)
[![npm downloads](https://img.shields.io/npm/dt/homebridge-snapshot-sensors)](https://www.npmjs.com/package/homebridge-snapshot-sensors)
[![GitHub stars](https://img.shields.io/github/stars/mrfatboy/homebridge-snapshot-sensors?style=flat)](https://github.com/mrfatboy/homebridge-snapshot-sensors/stargazers)
[![license](https://img.shields.io/npm/l/homebridge-snapshot-sensors)](https://github.com/mrfatboy/homebridge-snapshot-sensors/blob/main/LICENSE)

**Homebridge snapshot-triggered object detection using a local YOLO26 model.**

`homebridge-snapshot-sensors` retrieves a still image from one or more configured cameras, runs local object detection using the bundled YOLO26/ONNX Runtime engine, compares the detections against your individually configured sensors, optionally saves the image, and sends a push notification when configured.

