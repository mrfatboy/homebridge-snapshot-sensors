(() => {
  const cards = () => Array.from(document.querySelectorAll('.snapshot-card'));
  const setValue = (card, selector, value) => {
    const el = card.querySelector(selector);
    if (el && value !== undefined && value !== null) el.value = value;
  };

  const migrateNotifications = (snapshot) => {
    const notification = snapshot?.notifications;
    if (!notification || typeof notification !== 'object') return { value: {}, migrated: false };
    const hasNewShape = notification.pushover && typeof notification.pushover === 'object'
      || notification.pushbullet && typeof notification.pushbullet === 'object';
    if (hasNewShape) return { value: notification, migrated: false };

    const provider = typeof notification.provider === 'string' ? notification.provider : 'none';
    const migrated = {
      provider,
      pushover: {
        token: notification.token || '', user: notification.user || '', device: notification.device || '', sound: notification.sound || 'pushover', title: notification.title || 'Snapshot Sensors',
        animalMessage: notification.animalMessage || 'Animal Detected 🐕', personMessage: notification.personMessage || 'Person Detected 🚶‍♂️', vehicleMessage: notification.vehicleMessage || 'Vehicle Detected 🚗', unidentifiedMessage: notification.unidentifiedMessage || 'Unidentified Activity Detected ⚠️',
      },
      pushbullet: {
        apiKey: notification.apiKey || '', deviceIden: notification.deviceIden || '', email: notification.email || '', channelTag: notification.channelTag || '', title: notification.title || 'Snapshot Sensors',
        animalMessage: notification.animalMessage || 'Animal Detected 🐕', personMessage: notification.personMessage || 'Person Detected 🚶‍♂️', vehicleMessage: notification.vehicleMessage || 'Vehicle Detected 🚗', unidentifiedMessage: notification.unidentifiedMessage || 'Unidentified Activity Detected ⚠️',
      },
    };
    return { value: migrated, migrated: true };
  };

  (async () => {
    const configBlocks = await homebridge.getPluginConfig();
    const config = configBlocks[0] || { platform: 'SnapshotSensors', name: 'SnapshotSensors', snapshots: [] };
    if (!Array.isArray(config.snapshots)) config.snapshots = [];

    let configMigrated = false;
    const normalizedSnapshots = config.snapshots.map(snapshot => {
      const result = migrateNotifications(snapshot);
      if (!result.migrated) return snapshot;
      configMigrated = true;
      return { ...snapshot, notifications: result.value };
    });
    config.snapshots = normalizedSnapshots;

    const fillCard = (card, snapshot) => {
      setValue(card, '.snapshot-name', snapshot.name || ''); setValue(card, '.snapshot-url', snapshot.url || ''); setValue(card, '.snapshot-prefix', snapshot.snapshotPrefix || snapshot.name || '');
      setValue(card, '.store-snapshots', snapshot.storeSnapshots === 'raw' ? 'normal' : (snapshot.storeSnapshots || 'never')); setValue(card, '.snapshot-directory', snapshot.snapshotDirectory || ''); setValue(card, '.snapshot-ownership', snapshot.snapshotOwnership || '');
      const notification = snapshot.notifications || {}; const pushover = notification.pushover || {}; const pushbullet = notification.pushbullet || {};
      setValue(card, '.notifications-select', notification.provider || 'none'); setValue(card, '.pushover-token', pushover.token || ''); setValue(card, '.pushover-user', pushover.user || ''); setValue(card, '.pushover-device', pushover.device || ''); setValue(card, '.pushover-sound', pushover.sound || 'pushover'); setValue(card, '.pushover-title', pushover.title || 'Snapshot Sensors');
      setValue(card, '.pushover-animal-message', pushover.animalMessage || 'Animal Detected 🐕'); setValue(card, '.pushover-person-message', pushover.personMessage || 'Person Detected 🚶‍♂️'); setValue(card, '.pushover-vehicle-message', pushover.vehicleMessage || 'Vehicle Detected 🚗'); setValue(card, '.pushover-unidentified-message', pushover.unidentifiedMessage || 'Unidentified Activity Detected ⚠️');
      setValue(card, '.pushbullet-api-key', pushbullet.apiKey || ''); setValue(card, '.pushbullet-device-iden', pushbullet.deviceIden || ''); setValue(card, '.pushbullet-email', pushbullet.email || ''); setValue(card, '.pushbullet-channel-tag', pushbullet.channelTag || ''); setValue(card, '.pushbullet-title', pushbullet.title || 'Snapshot Sensors');
      setValue(card, '.pushbullet-animal-message', pushbullet.animalMessage || 'Animal Detected 🐕'); setValue(card, '.pushbullet-person-message', pushbullet.personMessage || 'Person Detected 🚶‍♂️'); setValue(card, '.pushbullet-vehicle-message', pushbullet.vehicleMessage || 'Vehicle Detected 🚗'); setValue(card, '.pushbullet-unidentified-message', pushbullet.unidentifiedMessage || 'Unidentified Activity Detected ⚠️');
      const sensor = card.querySelector('.sensor-settings'); const savedSensor = Array.isArray(snapshot.sensors) && snapshot.sensors.length ? snapshot.sensors[0] : {};
      if (sensor) {
        const cats = Array.isArray(savedSensor.categories) && savedSensor.categories.length ? savedSensor.categories : ['animals', 'people', 'vehicles'];
        sensor.querySelectorAll('.category').forEach(el => { el.checked = cats.includes(el.value); });
        const threshold = sensor.querySelector('.sensor-threshold'); if (threshold) threshold.value = savedSensor.threshold ?? 0.25;
      }
      card.querySelector('.store-snapshots')?.dispatchEvent(new Event('change', { bubbles: true })); card.querySelector('.notifications-select')?.dispatchEvent(new Event('change', { bubbles: true }));
    };

    while (cards().length < config.snapshots.length) document.querySelector('#addSnapshot').click();
    if (config.snapshots.length) config.snapshots.forEach((snapshot, i) => fillCard(cards()[i], snapshot));

    let saving = Promise.resolve();
    const syncConfig = () => {
      const snapshots = cards().map(card => {
        const sensors = Array.from(card.querySelectorAll('.sensor-settings')).map(sensor => {
          const thresholdElement = sensor.querySelector('.sensor-threshold'); const thresholdValue = thresholdElement ? thresholdElement.value.trim() : '0.25';
          return { categories: Array.from(sensor.querySelectorAll('.category:checked')).map(el => el.value), threshold: thresholdValue === '' ? 0.25 : Number(thresholdValue) };
        });
        return {
          name: card.querySelector('.snapshot-name').value.trim(), url: card.querySelector('.snapshot-url').value.trim(), snapshotPrefix: card.querySelector('.snapshot-prefix').value.trim(), storeSnapshots: card.querySelector('.store-snapshots').value,
          snapshotDirectory: card.querySelector('.snapshot-directory')?.value.trim() || '', snapshotOwnership: card.querySelector('.snapshot-ownership')?.value.trim() || '', sensors,
          notifications: {
            provider: card.querySelector('.notifications-select').value,
            pushover: { token: card.querySelector('.pushover-token').value.trim(), user: card.querySelector('.pushover-user').value.trim(), device: card.querySelector('.pushover-device').value.trim(), sound: card.querySelector('.pushover-sound').value.trim(), title: card.querySelector('.pushover-title').value.trim(), animalMessage: card.querySelector('.pushover-animal-message').value, personMessage: card.querySelector('.pushover-person-message').value, vehicleMessage: card.querySelector('.pushover-vehicle-message').value, unidentifiedMessage: card.querySelector('.pushover-unidentified-message').value },
            pushbullet: { apiKey: card.querySelector('.pushbullet-api-key').value.trim(), deviceIden: card.querySelector('.pushbullet-device-iden').value.trim(), email: card.querySelector('.pushbullet-email').value.trim(), channelTag: card.querySelector('.pushbullet-channel-tag').value.trim(), title: card.querySelector('.pushbullet-title').value.trim(), animalMessage: card.querySelector('.pushbullet-animal-message').value, personMessage: card.querySelector('.pushbullet-person-message').value, vehicleMessage: card.querySelector('.pushbullet-vehicle-message').value, unidentifiedMessage: card.querySelector('.pushbullet-unidentified-message').value },
          },
        };
      });
      config.snapshots = snapshots; saving = saving.then(() => homebridge.updatePluginConfig([config])).catch(error => console.error('Config update failed:', error)); return saving;
    };

    const snapshotsContainer = document.querySelector('#snapshots'); snapshotsContainer.addEventListener('input', syncConfig); snapshotsContainer.addEventListener('change', syncConfig); snapshotsContainer.addEventListener('blur', syncConfig, true);
    snapshotsContainer.addEventListener('click', event => { if (event.target.closest('#addSnapshot') || event.target.closest('.remove-snapshot')) setTimeout(syncConfig, 0); });
    if (configMigrated) await syncConfig(); else if (!config.snapshots.length) syncConfig();
  })();
})();
