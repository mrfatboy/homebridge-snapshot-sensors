# homebridge-snapshot-sensors

[![CI](https://github.com/mrfatboy/homebridge-snapshot-sensors/actions/workflows/ci.yml/badge.svg)](https://github.com/mrfatboy/homebridge-snapshot-sensors/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/homebridge-snapshot-sensors)](https://www.npmjs.com/package/homebridge-snapshot-sensors)
[![npm downloads](https://img.shields.io/npm/dt/homebridge-snapshot-sensors)](https://www.npmjs.com/package/homebridge-snapshot-sensors)
[![GitHub stars](https://img.shields.io/github/stars/mrfatboy/homebridge-snapshot-sensors?style=flat)](https://github.com/mrfatboy/homebridge-snapshot-sensors/stargazers)
[![license](https://img.shields.io/npm/l/homebridge-snapshot-sensors)](https://github.com/mrfatboy/homebridge-snapshot-sensors/blob/main/LICENSE)

**Homebridge snapshot-triggered object detection using a local YOLO26 model.**

`homebridge-snapshot-sensors` retrieves a still image from one or more configured cameras, runs local object detection using the bundled YOLO26/ONNX Runtime engine, compares the detections against your individually configured sensors, optionally saves the image, and optionally sends a push notification when configured.

No cloud-based object-detection service is required.

## Features

- 📷 Retrieve still images directly from camera snapshot URLs
- 🤖 Local YOLO26 object detection
- 🔒 Object detection runs locally on the Homebridge host
- 🏠 HomeKit-compatible Snapshot Sensor switches
- ⚡ Stateless switch behavior — the switch automatically turns off after 1 second
- 🎯 **Per-sensor detection thresholds**
- 🐕 Animal detection
- 🚶 Person detection
- 🚗 Vehicle detection
- ⚠️ Unidentified Activity notifications when no configured sensor matches
- 💾 Save the original camera image
- 🖼️ Save an annotated image containing YOLO detections
- 🔔 Push notifications
- 🔔 Pushover support
- 🔔 Pushbullet support
- 🔔 ntfy support
- 🔔 Push Safer support
- 👤 Optional filesystem ownership control for saved snapshots
- 🔄 Multiple independent Snapshot Sensors

## How it works

Each configured Snapshot Sensor has its own camera URL, sensor definitions, detection thresholds, image-storage settings, and notification configuration.

When the HomeKit/Homebridge switch is activated:

1. The plugin retrieves the camera's current snapshot.
2. The image is passed to the local YOLO26 detector.
3. YOLO analyzes the image for supported objects.
4. The detections are compared against each configured sensor.
5. Each sensor uses **its own configured confidence threshold**.
6. If a configured category matches, the appropriate notification is sent.
7. If no configured sensor matches the detections, an **Unidentified Activity detected** notification is sent when notifications are enabled.
8. The image is saved according to the configured storage mode.
9. The switch automatically returns to Off.
10. The detection process completes.

## HomeKit behavior

Each Snapshot configuration creates a Homebridge/HomeKit switch.

The switch is intended to behave as a **stateless trigger**:

- Turn On → start snapshot detection
- Automatically turns Off after approximately 1 second
- Turning it Off does not start another detection
- A second trigger is ignored while that Snapshot Sensor is already processing

This allows the switch to be used as a trigger from HomeKit automations, scenes, shortcuts, or other HomeKit-compatible systems.

## Detection categories

The detector uses the YOLO26 model and maps its object classes into Snapshot Sensor categories.

| Category | Examples |
|---|---|
| 🐕 **Animals** | Bird, Cat, Dog, Horse, Sheep, Cow, Elephant, Bear, Zebra, Giraffe |
| 🚶 **People** | Person |
| 🚗 **Vehicles** | Bicycle, Car, Motorcycle, Bus, Train, Truck, Boat |

## Sensor configuration

Each Snapshot can contain one or more sensor definitions.

A sensor specifies:

- Sensor name
- Detection categories
- Detection confidence threshold

### Per-sensor thresholds

Thresholds are configured **independently for each sensor**.

The lower the threshold value, the more sensitive the sensor is to detections. Lower values allow objects with lower confidence scores to trigger the sensor, while higher values require greater confidence before a detection is considered a match.

## Image storage

Snapshots can be configured to use one of three storage modes:

| Mode | Result |
|---|---|
| **Never** | Image is processed but not saved |
| **Normal** | Original camera image is saved |
| **Annotated** | Image with YOLO detection boxes is saved |

When image storage is enabled, a Snapshot Directory must be configured.

Optional settings include:

- Snapshot filename prefix
- Snapshot ownership override

Saved images include the configured prefix, date, time, and a unique identifier to prevent files from being overwritten.

## Notifications

Notifications are configured independently for each Snapshot.

| Provider | Supported |
|---|:---:|
| None | ✅ |
| Pushover | ✅ |
| Pushbullet | ✅ |
| ntfy | ✅ |
| Push Safer | ✅ |

Only the provider selected for that Snapshot is used.

### Detection messages

Each provider supports separate messages for:

- Animal detected
- Person detected
- Vehicle detected
- Unidentified Activity detected

Messages can be customized in the Homebridge configuration UI.

### Notification behavior

A notification is sent only when a detection matches one of the categories configured for a sensor.

For example, if a sensor is configured for **People** and YOLO detects a vehicle but no person, that sensor does not match.

If no configured sensor matches the detections, the plugin sends:

> **Unidentified Activity detected**

when a notification provider is configured.

## Configuration

### Homebridge UI

Configure the plugin from the Homebridge settings page.

For each Snapshot:

1. Enter a unique Snapshot Sensor name.
2. Enter the camera's Snapshot URL.
3. Select the image-storage mode.
4. Configure the Snapshot Directory if images are being saved.
5. Configure one or more sensors.
6. Select the desired detection categories.
7. Set the threshold for each sensor.
8. Select a notification provider if desired.
9. Configure the provider's credentials and notification messages.
10. Save the configuration.

### Camera Snapshot URL examples

The Snapshot URL must return a still JPEG image from the camera.

Common examples:

| Manufacturer | Snapshot URL |
|---|---|
| **Foscam** | `http://CAMERA_IP/cgi-bin/CGIProxy.fcgi?cmd=snapPicture2&usr=USERNAME&pwd=PASSWORD` |
| **Reolink** | `http://CAMERA_IP/cgi-bin/api.cgi?cmd=Snap&channel=0&rs=VALUE&user=USERNAME&password=PASSWORD` |
| **Hikvision** | `http://CAMERA_IP/ISAPI/Streaming/channels/1/picture` |

For example:

```text
http://192.168.1.50/ISAPI/Streaming/channels/1/picture
```

**Notes:**

- Replace `CAMERA_IP`, credentials, and other parameters with your camera's values.
- Camera model and firmware can affect the exact URL.
- Reolink's `channel` value depends on the camera/channel being accessed.
- Hikvision NVRs may use a different streaming channel number.
- The Homebridge server must be able to reach the camera.
- The URL must return an actual image, not a login page or camera configuration page.

### Testing a Snapshot URL

Before adding a URL to `homebridge-snapshot-sensors`, test it from a computer on the same network as Homebridge.

Open the URL in a web browser.

A successful URL should return or display a current camera image.

If the browser instead displays:

- A login page
- XML/JSON
- An error
- A camera configuration page
- A blank response

then the URL is not suitable for the Snapshot Sensor.

## Manual configuration

The plugin can also be configured through `config.json`.

Example:

```json
{
  "platforms": [
    {
      "platform": "SnapshotSensors",
      "name": "Snapshot Sensors",
      "snapshots": [
        {
          "name": "Driveway",
          "url": "http://192.168.1.50/snapshot.jpg",
          "storeSnapshots": "annotated",
          "snapshotDirectory": "/var/lib/homebridge/snapshots",
          "snapshotPrefix": "driveway",
          "sensors": [
            {
              "categories": ["animals", "people", "vehicles"],
              "thresholds": {
                "animals": 0.40,
                "people": 0.25,
                "vehicles": 0.50
              }
            }
          ],
          "notifications": {
            "provider": "pushover",
            "pushover": {
              "token": "YOUR_APP_TOKEN",
              "user": "YOUR_USER_KEY",
              "device": "",
              "sound": "pushover",
              "title": "Driveway",
              "animalMessage": "Animal detected 🐕",
              "personMessage": "Person detected 🚶‍♂️",
              "vehicleMessage": "Vehicle detected 🚗",
              "unidentifiedMessage": "Unidentified Activity detected ⚠️"
            },
            "pushbullet": {
              "apiKey": "",
              "deviceIden": "",
              "email": "",
              "channelTag": "",
              "title": "Driveway",
              "animalMessage": "Animal detected 🐕",
              "personMessage": "Person detected 🚶‍♂️",
              "vehicleMessage": "Vehicle detected 🚗",
              "unidentifiedMessage": "Unidentified Activity detected ⚠️"
            },
            "ntfy": {
              "server": "https://ntfy.sh",
              "topic": "",
              "accessToken": "",
              "priority": 3,
              "tags": "",
              "title": "Driveway",
              "animalMessage": "Animal detected 🐕",
              "personMessage": "Person detected 🚶‍♂️",
              "vehicleMessage": "Vehicle detected 🚗",
              "unidentifiedMessage": "Unidentified Activity detected ⚠️"
            },
            "pushsafer": {
              "privateKey": "",
              "pushsaferDevice": "",
              "title": "Driveway",
              "icon": 1,
              "vibration": 1,
              "iconColor": "",
              "sound": "",
              "url": "",
              "urlTitle": "",
              "priority": 0,
              "timeToLive": null,
              "retry": null,
              "expire": null,
              "animalMessage": "Animal detected 🐕",
              "personMessage": "Person detected 🚶‍♂️",
              "vehicleMessage": "Vehicle detected 🚗",
              "unidentifiedMessage": "Unidentified Activity detected ⚠️"
            }
          }
        }
      ]
    }
  ]
}
```

## Requirements

- Homebridge **1.8.0 or newer**
- Node.js **20 or newer**
- A camera providing a still-image/snapshot URL
- A supported 64-bit macOS, Linux, or Windows environment
- Sufficient CPU resources for local YOLO inference

The plugin includes its native YOLO runner and ONNX Runtime components.

## Privacy

Object detection is performed locally on the Homebridge host.

The camera image is retrieved from the configured camera and passed to the bundled local detection engine.

The plugin does not require sending camera images to a cloud-based object-detection service.

If a notification provider is configured, notification data is sent to that provider's service.

## Troubleshooting

### No snapshot is retrieved

Check:

- Snapshot URL
- Camera network connectivity
- Camera authentication requirements
- Whether the URL returns an actual image
- Whether the Homebridge host can reach the camera

### Detection does not trigger a sensor

Check:

- The sensor's selected categories
- The sensor's individual threshold
- Whether the object is large enough in the image
- Whether YOLO recognizes the object as one of the supported classes

Try lowering the **specific sensor's threshold** rather than looking for a global threshold.

### Too many detections

Increase the threshold for the affected sensor.

Because thresholds are configured per sensor, changing one sensor does not change the others.

### No notification

Check:

- A notification provider is selected.
- The provider credentials are correct.
- The desired category is enabled on a sensor.
- The detection meets that sensor's threshold.
- The Homebridge log for provider errors.

### Annotated images are not saved

Check:

- Store snapshots is set to **Annotated**.
- Snapshot Directory is configured.
- The Homebridge process has permission to write to that directory.

## Development

Clone the repository and install dependencies:

```bash
git clone https://github.com/mrfatboy/homebridge-snapshot-sensors.git
cd homebridge-snapshot-sensors
npm install
```

Build:

```bash
npm run build
```

Run tests:

```bash
npm test
```

Lint:

```bash
npm run lint
```

Format:

```bash
npm run format
```

## License

Licensed under **AGPL-3.0-only**.

Contributions and forks are welcome. Please retain the applicable license terms.
