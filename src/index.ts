import { API } from 'homebridge';
import { SnapshotSensorsPlatform } from './platform.js';
import { sendPushcutNotification } from './pushcut.js';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';

const platformPrototype = SnapshotSensorsPlatform.prototype as any;
const originalSendNotification = platformPrototype.sendNotification;
platformPrototype.sendNotification = async function (config: any, category: string) {
  const provider = config?.notifications?.provider ?? 'none';
  if (provider !== 'pushcut') return originalSendNotification.call(this, config, category);
  const channel = config?.notifications?.pushcut;
  const messageKey = category === 'unidentified' ? 'unidentifiedMessage' : category === 'people' ? 'personMessage' : category === 'animals' ? 'animalMessage' : 'vehicleMessage';
  const message = channel?.[messageKey];
  if (!message) return null;
  await sendPushcutNotification(channel, message);
  return 'Pushcut';
};

export default (api: API) => {
  api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, SnapshotSensorsPlatform);
};
