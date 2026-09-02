# Homebridge Snapshot Sensors

[![CI](https://github.com/mrfatboy/homebridge-snapshot-sensors/actions/workflows/ci.yml/badge.svg)](https://github.com/mrfatboy/homebridge-snapshot-sensors/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/homebridge-snapshot-sensors)](https://www.npmjs.com/package/homebridge-snapshot-sensors)
[![npm downloads](https://img.shields.io/npm/dt/homebridge-snapshot-sensors)](https://www.npmjs.com/package/homebridge-snapshot-sensors)
[![GitHub stars](https://img.shields.io/github/stars/mrfatboy/homebridge-snapshot-sensors?style=flat)](https://github.com/mrfatboy/homebridge-snapshot-sensors/stargazers)
[![license](https://img.shields.io/npm/l/homebridge-snapshot-sensors)](https://github.com/mrfatboy/homebridge-snapshot-sensors/blob/main/LICENSE)

**Homebridge snapshot-triggered object detection using a local YOLO26 model.**

`homebridge-snapshot-sensors` retrieves a still image from one or more configured cameras, runs local object detection using the bundled YOLO26/ONNX Runtime engine, compares the detections against your individually configured sensors, optionally saves the image, and sends a push notification when configured.

No cloud-based object-detection service is required.

## Features

- 📷 Retrieve still images directly from camera snapshot URLs
- 🤖 Local YOLO26 object detection
- 🔒 Object detection runs locally on the Homebridge host
- 🏠 HomeKit-compatible Snapshot Sensor switches
- ⚡ Stateless switch behavior — the switch automatically turns off after 1 second
- 🎯 **Per-category detection thresholds for each sensor**
- 🐕 Animal detection
- 🚶 Person detection
- 🚗 Vehicle detection
- ⚠️ Optional Unidentified Motion Activity fallback notifications when a detected object does not match a selected category
- 💾 Save the original camera image
- 🖼️ Save an annotated image containing matching YOLO detections
- 🔔 Push notifications
  - Pushover support
  - Pushcut support
  - Pushbullet support
  - Push Safer support
  - ntfy support
- 🔗 Generic webhook integration for external automations/services
- 🔄 Multiple independent Snapshot Sensors
- Use third-party sensors to trigger this plugin.

## How it works

Each configured Snapshot Sensor has its own camera URL, sensor definitions, detection thresholds, image-storage settings, and notification configuration.

When the HomeKit/Homebridge switch is activated:

1. The plugin retrieves the camera's current snapshot.
2. The image is passed to the local YOLO26 detector.
3. YOLO analyzes the image for supported objects.
4. The detections are compared against each configured sensor.
5. Each sensor applies its own configured confidence threshold for each selected category.
6. If a configured category matches, the appropriate notification is sent.
7. If YOLO detects one or more objects but none match any selected Animal, Person, or Vehicle category, an **Unidentified Activity detected** notification is sent only when **Unidentified Motion Activity ⚠️** is enabled and notifications are enabled. If the option is disabled, no push notification is sent and the result is logged as **No objects matching the selected categories were detected**.
8. If both matching and unmatched objects are detected, the matching selected category takes priority and no additional Unidentified Activity notification is sent.
9. The image is saved according to the configured storage mode. Annotated images include only detections that match a sensor's selected category and that category's configured threshold.
10. The switch automatically returns to Off.
11. The detection process completes.

## HomeKit behavior

Each Snapshot configuration creates a Homebridge/HomeKit switch.

The switch is intended to behave as a **stateless trigger**:

- Turn On → start snapshot detection
- Automatically turns Off after approximately 1 second
- Turning it Off does not start another detection
- A second trigger is ignored while that Snapshot Sensor is already processing

This allows the switch to be used as a trigger from HomeKit automations, scenes, shortcuts, or other HomeKit-compatible systems. You can use any sensor or trigger you want to trigger this plugin. There is no need to rely on the camera's poor detection system. For example, a Hue outdoor sensor is great to pair with this plugin.

## Detection categories

The detector uses the YOLO26 model and maps its object classes into Snapshot Sensor categories.

| Category | Examples |
|---|---|
| 🐕 **Animal** | Bird, Cat, Dog, Horse, Sheep, Cow, Elephant, Bear, Zebra, Giraffe |
| 🚶 **Person** | Person |
| 🚗 **Vehicle** | Bicycle, Car, Motorcycle, Bus, Train, Truck, Boat |

## Sensor configuration

Each Snapshot can contain one or more sensor definitions.

A sensor specifies:

- Sensor name
- Detection categories
- Detection confidence threshold for each selected category
- Whether **Unidentified Motion Activity ⚠️** is enabled as a fallback for detected objects that do not match a selected category

### Per-category thresholds

Thresholds are configured **independently for each selected category within each sensor**.

The lower the threshold value, the more sensitive the sensor is to detections. Lower values allow objects with lower confidence scores to trigger the sensor, while higher values require greater confidence before a detection is considered a match.

For example, a sensor can use one threshold for animals, another for people, and another for vehicles.

## Image storage

Snapshots can be configured to use one of three storage modes:

| Mode | Result |
|---|---|
| **Never** | Image is processed but not saved |
| **Normal** | Original camera image is saved |
| **Annotated** | Image with matching YOLO detection boxes is saved |

When image storage is enabled, a Snapshot Directory must be configured.

Optional settings include:

- Snapshot filename prefix
- Snapshot ownership override

Saved images include the configured prefix, date, time, and a unique identifier to prevent files from being overwritten.

### Docker installations

If Homebridge is running in Docker, the **Snapshot Directory must be accessible inside the Homebridge container**. If the directory exists on the Docker host but is not mounted into the container, Homebridge cannot browse to it or save snapshots there.

You may need to add a bind mount to your Docker Compose configuration. For example, if the snapshot directory on the Docker host is `/home/user/snapshots`, it could be mounted into the container as `/homebridge/snapshots`:

```yaml
volumes:
  - /home/user/snapshots:/homebridge/snapshots
```

Then configure the Snapshot Directory in the plugin as:

```text
/homebridge/snapshots
```

The **Browse** button displays directories available to the Homebridge container, not the underlying Docker host filesystem. The container path is the path that should be selected in the plugin configuration.

The exact host and container paths depend on your Docker Compose configuration.

## Notifications

Notifications are configured independently for each Snapshot.

| Provider | Supported |
|---|:---:|
| None | ✅ |
| Pushover | ✅ |
| Pushcut | ✅ |
| Pushbullet | ✅ |
| Push Safer | ✅ |
| ntfy | ✅ |

Only the provider selected for that Snapshot is used.

### Detection messages and sounds

Each provider supports separate messages for:

- Animal detected
- Person detected
- Vehicle detected
- Unidentified Activity detected

Pushover and Push Safer also support separate sounds for each detection type:

- Animal detect sound
- Person detect sound
- Vehicle detect sound
- Unidentified Activity sound

Messages and supported sound values can be customized in the Homebridge configuration UI.

### Notification behavior

A notification is sent when a detection matches one of the categories configured for a sensor and meets that category's configured threshold.

For example, if a sensor is configured for **Person** and YOLO detects a vehicle but no person, there is no matching selected category.

If YOLO detects one or more objects but none match any selected Animal, Person, or Vehicle category, the plugin sends the configured **Unidentified Activity** notification only when **Unidentified Motion Activity ⚠️** is enabled and a notification provider is configured.

If **Unidentified Motion Activity ⚠️** is disabled, no push notification is sent when detections do not match any selected category, and the result is logged as **No objects matching the selected categories were detected**.

If YOLO detects both a selected-category object and an unmatched object, the selected-category match wins and the plugin sends the matching category notification. It does not send an additional Unidentified Activity notification for the unmatched object.

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
7. Set the threshold for each selected category.
8. Select a notification provider if desired.
9. Configure the provider's credentials, notification messages, and sounds where supported.
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
              },
              "unidentifiedMotionActivity": true
            }
          ],
          "notifications": {
            "provider": "pushover",
            "pushover": {
              "token": "YOUR_APP_TOKEN",
              "user": "YOUR_USER_KEY",
              "device": "",
              "title": "Driveway",
              "animalMessage": "Animal detected 🐕",
              "animalSound": "pushover",
              "personMessage": "Person detected 🚶‍♂️",
              "personSound": "pushover",
              "vehicleMessage": "Vehicle detected 🚗",
              "vehicleSound": "pushover",
              "unidentifiedMessage": "Unidentified Activity detected ⚠️",
              "unidentifiedSound": "pushover"
            },
            "pushcut": {
              "pushcutUrl": "https://api.pushcut.io/YOUR_SECRET/notifications/YOUR_NOTIFICATION",
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
              "url": "",
              "urlTitle": "",
              "priority": 0,
              "timeToLive": null,
              "retry": null,
              "expire": null,
              "animalMessage": "Animal detected 🐕",
              "animalSound": "",
              "personMessage": "Person detected 🚶‍♂️",
              "personSound": "",
              "vehicleMessage": "Vehicle detected 🚗",
              "vehicleSound": "",
              "unidentifiedMessage": "Unidentified Activity detected ⚠️",
              "unidentifiedSound": ""
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
- The Sharp Node.js image-processing library for generating annotated detection images

The plugin uses the Node.js ONNX Runtime package with the bundled YOLO26 model. Sharp is used to generate annotated images, including detection bounding boxes, labels, confidence values, and annotation background panels.

## Privacy

Object detection is performed locally on the Homebridge host using the YOLO26 model and Node.js ONNX Runtime.

The camera image is retrieved from the configured camera and processed by the local detection engine.

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
- The threshold for the detected category on that sensor
- Whether the object is large enough in the image
- Whether YOLO recognizes the object as one of the supported classes

Try lowering the **specific category's threshold** rather than looking for a global threshold.

### Too many detections

Increase the threshold for the affected category on the affected sensor.

Because thresholds are configured per category and per sensor, changing one threshold does not change the others.

### No notification

Check:

- A notification provider is selected.
- The provider credentials are correct.
- The desired category is enabled on a sensor.
- The detection meets that sensor/category's threshold.
- The Homebridge log for provider errors.

### Annotated images are not saved

Check:

- Store snapshots is set to **Annotated**.
- Snapshot Directory is configured.
- The Homebridge process has permission to write to that directory.

## License

Licensed under **AGPL-3.0-only**.

Contributions and forks are welcome. Please retain the applicable license terms.
