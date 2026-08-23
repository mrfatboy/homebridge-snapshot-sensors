(() => {
  const cards = () => Array.from(document.querySelectorAll('.snapshot-card'));
  const setValue = (card, selector, value) => {
    const el = card.querySelector(selector);
    if (el && value !== undefined && value !== null) el.value = value;
  };

  (async () => {
    const configBlocks = await homebridge.getPluginConfig();
    const config = configBlocks[0] || { platform: 'SnapshotSensors', name: 'SnapshotSensors', snapshots: [] };
    if (!Array.isArray(config.snapshots)) config.snapshots = [];

    const fillCard = (card, snapshot) => {
      setValue(card, '.snapshot-name', snapshot.name || '');
      setValue(card, '.snapshot-url', snapshot.url || '');
      setValue(card, '.snapshot-prefix', snapshot.snapshotPrefix || snapshot.name || '');
      setValue(card, '.store-snapshots', snapshot.storeSnapshots === 'raw' ? 'normal' : (snapshot.storeSnapshots || 'never'));
      setValue(card, '.snapshot-directory', snapshot.snapshotDirectory || '');
      setValue(card, '.snapshot-ownership', snapshot.snapshotOwnership || '');

      const notification = snapshot.notifications || {};
      setValue(card, '.notifications-select', notification.provider || 'none');
      setValue(card, '.pushover-token', notification.token || '');
      setValue(card, '.pushover-user', notification.user || '');
      setValue(card, '.pushover-device', notification.device || '');
      setValue(card, '.pushover-sound', notification.sound || 'pushover');
      setValue(card, '.pushover-title', notification.title || 'Snapshot Sensors');
      setValue(card, '.pushcut-api-key', notification.apiKey || '');
      setValue(card, '.pushcut-notification-name', notification.notificationName || '');
      setValue(card, '.pushcut-device', notification.device || '');
      setValue(card, '.pushcut-sound', notification.sound || 'system');

      const sensor = card.querySelector('.sensor-settings');
      const savedSensor = Array.isArray(snapshot.sensors) && snapshot.sensors.length ? snapshot.sensors[0] : {};
      if (sensor) {
        const cats = Array.isArray(savedSensor.categories) && savedSensor.categories.length
          ? savedSensor.categories
          : ['animals', 'people', 'vehicles'];
        sensor.querySelectorAll('.category').forEach(el => { el.checked = cats.includes(el.value); });
        const threshold = sensor.querySelector('.sensor-threshold');
        if (threshold) threshold.value = savedSensor.threshold ?? 0.25;
        const log = sensor.querySelector('.sensor-log');
        if (log) log.checked = !!savedSensor.logStatus;
      }

      card.querySelector('.store-snapshots')?.dispatchEvent(new Event('change', { bubbles: true }));
      card.querySelector('.notifications-select')?.dispatchEvent(new Event('change', { bubbles: true }));
    };

    while (cards().length < config.snapshots.length) document.querySelector('#addSnapshot').click();
    if (config.snapshots.length) config.snapshots.forEach((snapshot, i) => fillCard(cards()[i], snapshot));

    let saving = Promise.resolve();
    const syncConfig = () => {
      const snapshots = cards().map(card => {
        const sensors = Array.from(card.querySelectorAll('.sensor-settings')).map(sensor => {
          const thresholdElement = sensor.querySelector('.sensor-threshold');
          const thresholdValue = thresholdElement ? thresholdElement.value.trim() : '0.25';
          return {
            categories: Array.from(sensor.querySelectorAll('.category:checked')).map(el => el.value),
            logStatus: sensor.querySelector('.sensor-log').checked,
            threshold: thresholdValue === '' ? 0.25 : Number(thresholdValue),
          };
        });

        return {
          name: card.querySelector('.snapshot-name').value.trim(),
          url: card.querySelector('.snapshot-url').value.trim(),
          snapshotPrefix: card.querySelector('.snapshot-prefix').value.trim(),
          storeSnapshots: card.querySelector('.store-snapshots').value,
          snapshotDirectory: card.querySelector('.snapshot-directory')?.value.trim() || '',
          snapshotOwnership: card.querySelector('.snapshot-ownership')?.value.trim() || '',
          sensors,
          notifications: {
            provider: card.querySelector('.notifications-select').value,
            token: card.querySelector('.pushover-token').value.trim(),
            user: card.querySelector('.pushover-user').value.trim(),
            device: card.querySelector('.pushover-device').value.trim(),
            sound: card.querySelector('.pushover-sound').value.trim(),
            title: card.querySelector('.pushover-title').value.trim(),
            apiKey: card.querySelector('.pushcut-api-key').value.trim(),
            notificationName: card.querySelector('.pushcut-notification-name').value.trim(),
          },
        };
      });

      config.snapshots = snapshots;
      saving = saving.then(() => homebridge.updatePluginConfig([config]))
        .catch(error => console.error('Config update failed:', error));
      return saving;
    };

    const snapshotsContainer = document.querySelector('#snapshots');
    snapshotsContainer.addEventListener('input', syncConfig);
    snapshotsContainer.addEventListener('change', syncConfig);
    snapshotsContainer.addEventListener('blur', syncConfig, true);
    snapshotsContainer.addEventListener('click', event => {
      if (event.target.closest('#addSnapshot') || event.target.closest('.remove-snapshot')) {
        setTimeout(syncConfig, 0);
      }
    });

    if (!config.snapshots.length) syncConfig();
  })();
})();
