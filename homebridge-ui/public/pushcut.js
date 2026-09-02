(() => {
  const cards = () => Array.from(document.querySelectorAll('.snapshot-card'));
  const defaults = { animalMessage: 'Animal Detected 🐕', personMessage: 'Person Detected 🚶‍♂️', vehicleMessage: 'Vehicle Detected 🚗', unidentifiedMessage: 'Unidentified Activity Detected ⚠️' };

  function controlsHtml() {
    return `<div class="pushcut-controls form-group mb-3" style="display:none"><div class="form-group mb-3"><label>Pushcut Webhook URL</label><input class="form-control pushcut-url" type="password" autocomplete="off" placeholder="https://api.pushcut.io/.../notifications/..."><div class="help-text mt-1">Paste the secret webhook URL copied from the Pushcut app. Treat this URL like a password.</div></div><div class="form-group mb-3"><label>Pushcut Title</label><input class="form-control pushcut-title" type="text" value="Snapshot Sensors" placeholder="Snapshot Sensors"><div class="help-text mt-1">Dynamic titles require Pushcut Pro. Without Pro, Pushcut uses the title configured in the app.</div></div><div class="form-group mb-3"><label>🐕 Animal Detect Message</label><input class="form-control pushcut-animal-message" type="text" value="Animal Detected 🐕"></div><div class="form-group mb-3"><label>🚶‍♂️ Person Detected Message</label><input class="form-control pushcut-person-message" type="text" value="Person Detected 🚶‍♂️"></div><div class="form-group mb-3"><label>🚗 Vehicle Detected Message</label><input class="form-control pushcut-vehicle-message" type="text" value="Vehicle Detected 🚗"></div><div class="form-group mb-3"><label>⚠️ Unidentified Activity Detected</label><input class="form-control pushcut-unidentified-message" type="text" value="Unidentified Activity Detected ⚠️"></div><div class="form-group mb-3"><button type="button" class="btn btn-outline-secondary test-notification">🔔 Test Notification</button><div style="clear:both"></div></div></div>`;
  }

  function ensure(card) {
    const select = card.querySelector('.notifications-select');
    if (!select) return;
    if (!select.querySelector('option[value="pushcut"]')) select.insertAdjacentHTML('beforeend', '<option value="pushcut">Pushcut</option>');
    if (!card.querySelector('.pushcut-controls')) {
      const anchor = card.querySelector('.pushsafer-controls') || card.querySelector('.ntfy-controls') || select.closest('.form-group');
      anchor?.insertAdjacentHTML('afterend', controlsHtml());
    }
    update(card);
  }

  function update(card) {
    const select = card.querySelector('.notifications-select');
    const controls = card.querySelector('.pushcut-controls');
    if (controls) controls.style.display = select?.value === 'pushcut' ? '' : 'none';
  }

  function read(card) {
    const value = (selector) => card.querySelector(selector)?.value || '';
    return {
      pushcutUrl: value('.pushcut-url').trim(),
      title: value('.pushcut-title').trim(),
      animalMessage: value('.pushcut-animal-message'),
      personMessage: value('.pushcut-person-message'),
      vehicleMessage: value('.pushcut-vehicle-message'),
      unidentifiedMessage: value('.pushcut-unidentified-message'),
    };
  }

  const originalUpdate = homebridge.updatePluginConfig.bind(homebridge);
  homebridge.updatePluginConfig = async (configBlocks) => {
    cards().forEach(ensure);
    const config = configBlocks?.[0];
    if (Array.isArray(config?.snapshots)) {
      config.snapshots = config.snapshots.map((snapshot, index) => {
        const card = cards()[index];
        if (!card) return snapshot;
        const next = { ...snapshot, notifications: { ...(snapshot.notifications || {}) } };
        const pushcut = read(card);
        if (next.notifications.provider === 'pushcut' || pushcut.pushcutUrl) next.notifications.pushcut = pushcut;
        return next;
      });
    }
    return originalUpdate(configBlocks);
  };

  async function fill() {
    const configBlocks = await homebridge.getPluginConfig();
    const config = configBlocks?.[0] || {};
    cards().forEach(ensure);
    (config.snapshots || []).forEach((snapshot, index) => {
      const card = cards()[index];
      if (!card) return;
      const pushcut = snapshot.notifications?.pushcut || {};
      const set = (selector, value, fallback = '') => { const el = card.querySelector(selector); if (el) el.value = value ?? fallback; };
      set('.pushcut-url', pushcut.pushcutUrl);
      set('.pushcut-title', pushcut.title, 'Snapshot Sensors');
      set('.pushcut-animal-message', pushcut.animalMessage, defaults.animalMessage);
      set('.pushcut-person-message', pushcut.personMessage, defaults.personMessage);
      set('.pushcut-vehicle-message', pushcut.vehicleMessage, defaults.vehicleMessage);
      set('.pushcut-unidentified-message', pushcut.unidentifiedMessage, defaults.unidentifiedMessage);
      update(card);
    });
  }

  const root = document.querySelector('#snapshots');
  if (!root) return;
  const observer = new MutationObserver(() => cards().forEach(ensure));
  observer.observe(root, { childList: true, subtree: false });
  root.addEventListener('change', event => {
    const card = event.target.closest('.snapshot-card');
    if (card && event.target.classList.contains('notifications-select')) update(card);
  });
  root.addEventListener('click', async event => {
    const button = event.target.closest('.test-notification');
    if (!button || !button.closest('.pushcut-controls')) return;
    const card = button.closest('.snapshot-card');
    const settings = read(card);
    if (!settings.pushcutUrl) { homebridge.toast.error('Please enter the Pushcut Webhook URL.', 'Invalid Pushcut Settings'); return; }
    if (!settings.title) { homebridge.toast.error('Please enter the Pushcut Title.', 'Invalid Pushcut Settings'); return; }
    button.disabled = true;
    try {
      await homebridge.request('/test-webhook', { url: settings.pushcutUrl, method: 'POST' });
      homebridge.toast.success('Test Notification sent successfully.', 'Pushcut Test');
    } catch (error) {
      homebridge.toast.error(error?.message || 'Unable to send Pushcut notification.', 'Pushcut Test Failed');
    } finally { button.disabled = false; }
  });
  setTimeout(fill, 0);
})();
