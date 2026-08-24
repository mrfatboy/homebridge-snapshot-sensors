(() => {
  const snapshots = document.querySelector('#snapshots');

  function sensorHtml() {
    return `<div class="sensor-settings"><div class="mb-2 sensor-heading"><strong><span class="sensor-emoji">📡</span> Sensor</strong></div><div class="form-group mb-3"><label>Categories</label><div class="form-check"><input class="form-check-input category" type="checkbox" value="animals" checked><label class="form-check-label">🐕 Animal</label></div><div class="form-check"><input class="form-check-input category" type="checkbox" value="people" checked><label class="form-check-label">🚶‍♂️ Person</label></div><div class="form-check"><input class="form-check-input category" type="checkbox" value="vehicles" checked><label class="form-check-label">🚗 Vehicle</label></div></div><div class="form-group mb-3"><label>🎚️ Threshold</label><input class="form-control sensor-threshold" type="number" min="0" max="1" step="0.01" value="0.25"></div></div>`;
  }

  function messageFieldsHtml(prefix) {
    return `<div class="form-group mb-3"><label>🐕 Animal Detect Message</label><input class="form-control ${prefix}-animal-message" type="text" value="Animal Detected 🐕" placeholder="Animal Detected 🐕"></div><div class="form-group mb-3"><label>🚶‍♂️ Person Detected Message</label><input class="form-control ${prefix}-person-message" type="text" value="Person Detected 🚶‍♂️" placeholder="Person Detected 🚶‍♂️"></div><div class="form-group mb-3"><label>🚗 Vehicle Detected Message</label><input class="form-control ${prefix}-vehicle-message" type="text" value="Vehicle Detected 🚗" placeholder="Vehicle Detected 🚗"></div><div class="form-group mb-3"><label>⚠️ Unidentified Activity Detected</label><input class="form-control ${prefix}-unidentified-message" type="text" value="Unidentified Activity Detected ⚠️" placeholder="Unidentified Activity Detected ⚠️"></div>`;
  }

  function snapshotHtml() {
    return `<div class="card snapshot-card"><div class="card-header d-flex justify-content-between align-items-center"><strong>📷 Your Snapshot sensor</strong><button type="button" class="btn btn-sm btn-outline-danger remove-snapshot">REMOVE</button></div><div class="card-body"><div class="mb-2 camera-snapshot-heading"><strong><span class="camera-snapshot-emoji">📷</span> Camera Snapshot</strong></div><div class="form-group mb-3"><label>🏷️ Snapshot sensor name</label><input class="form-control snapshot-name" type="text" placeholder="CameraSensor1"><div class="help-text mt-1">This is the name of the virtual switch that will be exposed in Homekit</div></div><div class="form-group mb-3"><label>🔗 Snapshot URL</label><input class="form-control snapshot-url" type="url" placeholder="http://192.168.1.50:88/cgi-bin/CGIProxy.fcgi?cmd=snapPicture2&usr=USERNAME&pwd=PASSWORD"><div class="help-text mt-1">The URL used to retrieve a snapshot image from your camera.</div></div><div class="form-group mb-3"><label>Snapshot prefix</label><input class="form-control snapshot-prefix" type="text" placeholder="CameraSensor1"><div class="help-text mt-1">This name will be used as the prefix to the saved snapshot</div></div><div class="form-group mb-3"><label>💾 Store snapshots</label><select class="form-control store-snapshots"><option value="never">Never</option><option value="normal">Normal</option><option value="annotated">Annotated</option></select></div><div class="snapshot-directory-controls form-group mb-3" style="display:none"><label>📁 Snapshot Directory</label><input class="form-control snapshot-directory" type="text" placeholder="/path/to/snapshots"><div class="help-text mt-1">Required when Store snapshots is Normal or Annotated.</div><div class="form-group mt-3"><label>👥 Snapshot Ownership Override (optional)</label><input class="form-control snapshot-ownership" type="text" placeholder="username or username:group"><div class="help-text mt-1">Override default Camera Snapshot file ownership</div></div></div><div style="height: 1rem;"></div><div class="form-group mb-3"><button type="button" class="btn btn-outline-secondary test-snapshot">📸 Test Snapshot</button><div style="clear:both"></div></div><div class="sensors">${sensorHtml()}</div><div style="clear:both"></div><div class="form-group mb-3"><label class="notifications-heading"><span class="notifications-emoji">🔔</span> Notifications</label><select class="form-control notifications-select"><option value="none">None</option><option value="pushover">Pushover</option><option value="pushbullet">Pushbullet</option><option value="ntfy">ntfy</option></select></div><div class="pushover-controls form-group mb-3" style="display:none"><div class="form-group mb-3"><label>Pushover Application Token</label><input class="form-control pushover-token" type="password" autocomplete="off" placeholder="Application API token"></div><div class="form-group mb-3"><label>Pushover User Key</label><input class="form-control pushover-user" type="password" autocomplete="off" placeholder="User or group key"></div><div class="form-group mb-3"><label>Pushover Device (optional)</label><input class="form-control pushover-device" type="text" placeholder="Device name (optional)"></div><div class="form-group mb-3"><label>Pushover Sound</label><input class="form-control pushover-sound" type="text" value="pushover" placeholder="pushover"></div><div class="form-group mb-3"><label>Pushover Title</label><input class="form-control pushover-title" type="text" placeholder="Snapshot Sensors"></div>${messageFieldsHtml('pushover')}<div class="form-group mb-3"><button type="button" class="btn btn-outline-secondary test-notification">🔔 Test Notification</button><div style="clear:both"></div></div></div><div class="pushbullet-controls form-group mb-3" style="display:none"><div class="form-group mb-3"><label>Pushbullet Access Token</label><input class="form-control pushbullet-api-key" type="password" autocomplete="off" placeholder="Access token"></div><div class="form-group mb-3"><label>Pushbullet Device Identifier (optional)</label><input class="form-control pushbullet-device-iden" type="text" placeholder="Device identifier"></div><div class="form-group mb-3"><label>Pushbullet Email (optional)</label><input class="form-control pushbullet-email" type="email" placeholder="Email address"></div><div class="form-group mb-3"><label>Pushbullet Channel Tag (optional)</label><input class="form-control pushbullet-channel-tag" type="text" placeholder="Channel tag"></div><div class="form-group mb-3"><label>Pushbullet Title</label><input class="form-control pushbullet-title" type="text" value="Snapshot Sensors" placeholder="Snapshot Sensors"></div>${messageFieldsHtml('pushbullet')}<div class="form-group mb-3"><button type="button" class="btn btn-outline-secondary test-notification">🔔 Test Notification</button><div style="clear:both"></div></div></div><div class="ntfy-controls form-group mb-3" style="display:none"><div class="form-group mb-3"><label>ntfy Server URL</label><input class="form-control ntfy-server" type="url" value="https://ntfy.sh" placeholder="https://ntfy.sh"></div><div class="form-group mb-3"><label>ntfy Topic</label><input class="form-control ntfy-topic" type="text" placeholder="your-topic"></div><div class="form-group mb-3"><label>ntfy Access Token (optional)</label><input class="form-control ntfy-access-token" type="password" autocomplete="off" placeholder="tk_..."></div><div class="form-group mb-3"><label>ntfy Priority</label><select class="form-control ntfy-priority"><option value="1">Min</option><option value="2">Low</option><option value="3" selected>Default</option><option value="4">High</option><option value="5">Max</option></select></div><div class="form-group mb-3"><label>ntfy Tags (optional)</label><input class="form-control ntfy-tags" type="text" placeholder="camera,warning"></div><div class="form-group mb-3"><label>ntfy Title</label><input class="form-control ntfy-title" type="text" value="Snapshot Sensors" placeholder="Snapshot Sensors"></div>${messageFieldsHtml('ntfy')}<div class="form-group mb-3"><button type="button" class="btn btn-outline-secondary test-notification">🔔 Test Notification</button><div style="clear:both"></div></div></div></div></div>`;
  }

  function updateDirectoryVisibility(snapshot) {
    const store = snapshot.querySelector('.store-snapshots');
    const controls = snapshot.querySelector('.snapshot-directory-controls');
    if (controls) controls.style.display = store.value === 'never' ? 'none' : '';
  }

  function updateNotificationVisibility(snapshot) {
    const notifications = snapshot.querySelector('.notifications-select');
    const pushover = snapshot.querySelector('.pushover-controls');
    const pushbullet = snapshot.querySelector('.pushbullet-controls');
    const ntfy = snapshot.querySelector('.ntfy-controls');
    pushover.style.display = notifications.value === 'pushover' ? '' : 'none';
    pushbullet.style.display = notifications.value === 'pushbullet' ? '' : 'none';
    ntfy.style.display = notifications.value === 'ntfy' ? '' : 'none';
  }

  function addSnapshot() {
    snapshots.insertAdjacentHTML('beforeend', snapshotHtml());
    const snapshot = snapshots.lastElementChild;
    updateDirectoryVisibility(snapshot);
    updateNotificationVisibility(snapshot);
  }

  snapshots.addEventListener('change', event => {
    const snapshot = event.target.closest('.snapshot-card');
    if (!snapshot) return;
    if (event.target.classList.contains('store-snapshots')) updateDirectoryVisibility(snapshot);
    if (event.target.classList.contains('notifications-select')) updateNotificationVisibility(snapshot);
  });

  snapshots.addEventListener('click', async event => {
    const snapshot = event.target.closest('.snapshot-card');
    if (!snapshot) return;
    if (event.target.closest('.remove-snapshot')) { snapshot.remove(); return; }

    if (event.target.closest('.test-notification')) {
      const button = event.target.closest('.test-notification');
      const provider = snapshot.querySelector('.notifications-select').value;
      let requestBody;
      if (provider === 'pushbullet') {
        const apiKey = snapshot.querySelector('.pushbullet-api-key').value.trim();
        const deviceIden = snapshot.querySelector('.pushbullet-device-iden').value.trim();
        const email = snapshot.querySelector('.pushbullet-email').value.trim();
        const channelTag = snapshot.querySelector('.pushbullet-channel-tag').value.trim();
        const title = snapshot.querySelector('.pushbullet-title').value.trim();
        if (!apiKey) { homebridge.toast.error('Please enter the Pushbullet Access Token.', 'Invalid Pushbullet Settings'); return; }
        if (!title) { homebridge.toast.error('Please enter the Pushbullet Title.', 'Invalid Pushbullet Settings'); return; }
        if (deviceIden && email || deviceIden && channelTag || email && channelTag) { homebridge.toast.error('Specify only one Pushbullet target: Device Identifier, Email, or Channel Tag.', 'Invalid Pushbullet Settings'); return; }
        requestBody = { provider, apiKey, deviceIden, email, channelTag, title };
      } else if (provider === 'ntfy') {
        const server = snapshot.querySelector('.ntfy-server').value.trim();
        const topic = snapshot.querySelector('.ntfy-topic').value.trim();
        const accessToken = snapshot.querySelector('.ntfy-access-token').value.trim();
        const priority = Number(snapshot.querySelector('.ntfy-priority').value || 3);
        const tags = snapshot.querySelector('.ntfy-tags').value.trim();
        const title = snapshot.querySelector('.ntfy-title').value.trim();
        if (!server) { homebridge.toast.error('Please enter the ntfy Server URL.', 'Invalid ntfy Settings'); return; }
        if (!topic) { homebridge.toast.error('Please enter the ntfy Topic.', 'Invalid ntfy Settings'); return; }
        if (!title) { homebridge.toast.error('Please enter the ntfy Title.', 'Invalid ntfy Settings'); return; }
        requestBody = { provider, server, topic, accessToken, priority, tags, title };
      } else {
        const token = snapshot.querySelector('.pushover-token').value.trim();
        const user = snapshot.querySelector('.pushover-user').value.trim();
        const device = snapshot.querySelector('.pushover-device').value.trim();
        const sound = snapshot.querySelector('.pushover-sound').value.trim();
        const title = snapshot.querySelector('.pushover-title').value.trim();
        if (!token) { homebridge.toast.error('Please enter the Pushover Application Token.', 'Invalid Pushover Settings'); return; }
        if (!user) { homebridge.toast.error('Please enter the Pushover User Key.', 'Invalid Pushover Settings'); return; }
        if (!sound) { homebridge.toast.error('Please enter the Pushover Sound.', 'Invalid Pushover Settings'); return; }
        if (!title) { homebridge.toast.error('Please enter the Pushover Title.', 'Invalid Pushover Settings'); return; }
        requestBody = { provider: 'pushover', token, user, device, sound, title };
      }
      button.disabled = true;
      const originalText = button.textContent;
      button.textContent = '🔔 Testing...';
      try {
        await homebridge.request('/test-notification', requestBody);
        homebridge.toast.success('Test notification sent successfully.', provider === 'pushbullet' ? 'Pushbullet' : provider === 'ntfy' ? 'ntfy' : 'Pushover');
      } catch (error) {
        console.error('Test Notification failed:', error);
        homebridge.toast.error(error?.message || 'Unable to send the notification.', 'Test Notification Failed');
      } finally {
        button.disabled = false;
        button.textContent = originalText;
      }
      return;
    }

    if (event.target.closest('.test-snapshot')) {
      const button = event.target.closest('.test-snapshot');
      const url = snapshot.querySelector('.snapshot-url').value.trim();
      const directory = snapshot.querySelector('.snapshot-directory')?.value.trim() || '';
      const ownership = snapshot.querySelector('.snapshot-ownership')?.value.trim() || '';
      const prefix = snapshot.querySelector('.snapshot-prefix').value.trim() || snapshot.querySelector('.snapshot-name').value.trim();
      const storeSnapshots = snapshot.querySelector('.store-snapshots').value;
      if (!url) { homebridge.toast.error('Please enter a valid Snapshot URL.', 'Invalid Snapshot URL'); return; }
      if (!prefix) { homebridge.toast.error('Please enter a Snapshot prefix.', 'Invalid Snapshot Prefix'); return; }
      button.disabled = true;
      const originalText = button.textContent;
      button.textContent = '📸 Testing...';
      try {
        const result = await homebridge.request('/test-snapshot', { url, directory, prefix, ownership, storeSnapshots });
        if (!result?.image) throw new Error('The camera did not return an image.');
        document.querySelector('#snapshotResult').src = `data:${result.contentType || 'image/jpeg'};base64,${result.image}`;
        const modal = document.querySelector('#snapshotModal');
        const heading = snapshot.querySelector('.camera-snapshot-heading');
        const rect = heading.getBoundingClientRect();
        const modalWidth = Math.min(800, window.innerWidth - 20);
        const modalHeight = Math.min(window.innerHeight - 20, 700);
        const left = Math.max(10, Math.min(rect.left, window.innerWidth - modalWidth - 10));
        const top = Math.max(10, Math.min(rect.top, window.innerHeight - modalHeight - 10));
        modal.classList.add('snapshot-test-modal');
        modal.style.left = `${left}px`;
        modal.style.top = `${top}px`;
        modal.classList.add('show');
        modal.style.display = 'block';
        modal.removeAttribute('aria-hidden');
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop fade show';
        document.body.appendChild(backdrop);
        const close = () => { modal.classList.remove('show', 'snapshot-test-modal'); modal.style.display = 'none'; modal.setAttribute('aria-hidden', 'true'); modal.style.left = ''; modal.style.top = ''; backdrop.remove(); };
        modal.querySelectorAll('[data-bs-dismiss="modal"], .btn-close').forEach(el => el.onclick = close);
      } catch (error) {
        console.error('Test Snapshot failed:', error);
        homebridge.toast.error(error?.message || 'Unable to retrieve or save the snapshot.', 'Test Snapshot Failed');
      } finally {
        button.disabled = false;
        button.textContent = originalText;
      }
      return;
    }
  });

  document.querySelector('#addSnapshot').addEventListener('click', addSnapshot);
  addSnapshot();
})();
