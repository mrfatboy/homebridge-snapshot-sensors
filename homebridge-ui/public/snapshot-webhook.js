(() => {
  const cards = () => Array.from(document.querySelectorAll('.snapshot-card'));
  const webhookHtml = () => `<div class="webhook-controls form-group mb-3"><div class="form-group mb-3"><label>Enable Webhook</label><div class="form-check"><input class="form-check-input webhook-enabled" type="checkbox"><label class="form-check-label ms-2">Send detection events to a webhook</label></div></div><div class="form-group mb-3"><label>Webhook URL</label><input class="form-control webhook-url" type="url" placeholder="http://192.168.1.100:8080/webhook"><div class="help-text mt-1">Sends the highest-confidence matching detection. Webhook failures do not affect detection or push notifications.</div></div><div class="form-group mb-3"><label>Webhook Method</label><select class="form-control webhook-method"><option value="POST">POST</option><option value="GET">GET</option></select></div><div class="form-group mb-3"><button type="button" class="btn btn-outline-secondary test-webhook" disabled>🔗 Test Webhook</button><div style="clear:both"></div></div></div>`;
  const addControls = (card) => {
    if (card.querySelector('.webhook-controls')) return;
    const notifications = card.querySelector('.notifications-heading')?.closest('.form-group');
    if (!notifications) return;
    notifications.insertAdjacentHTML('afterend', webhookHtml());
    update(card);
  };
  const update = (card) => {
    const url = card.querySelector('.webhook-url');
    const test = card.querySelector('.test-webhook');
    if (!url || !test) return;
    test.disabled = !url.value.trim();
  };
  const ensureAll = () => cards().forEach(addControls);
  const originalUpdate = homebridge.updatePluginConfig.bind(homebridge);
  homebridge.updatePluginConfig = async (configBlocks) => {
    ensureAll();
    const config = configBlocks?.[0];
    if (config?.snapshots && Array.isArray(config.snapshots)) {
      config.snapshots = config.snapshots.map((snapshot, index) => {
        const card = cards()[index];
        if (!card) return snapshot;
        const url = card.querySelector('.webhook-url')?.value.trim() || '';
        const enabled = card.querySelector('.webhook-enabled')?.checked === true;
        const method = card.querySelector('.webhook-method')?.value === 'GET' ? 'GET' : 'POST';
        const next = { ...snapshot };
        if (enabled || url) next.webhook = { enabled, url, method };
        else delete next.webhook;
        return next;
      });
    }
    return originalUpdate(configBlocks);
  };
  const fill = async () => {
    const configBlocks = await homebridge.getPluginConfig();
    const config = configBlocks?.[0] || {};
    ensureAll();
    (config.snapshots || []).forEach((snapshot, index) => {
      const card = cards()[index];
      if (!card) return;
      const webhook = snapshot.webhook || {};
      const enabled = card.querySelector('.webhook-enabled');
      const url = card.querySelector('.webhook-url');
      const method = card.querySelector('.webhook-method');
      if (enabled) enabled.checked = webhook.enabled === true;
      if (url) url.value = webhook.url || '';
      if (method) method.value = webhook.method === 'GET' ? 'GET' : 'POST';
      update(card);
    });
  };
  const observer = new MutationObserver(ensureAll);
  observer.observe(document.querySelector('#snapshots'), { childList: true, subtree: false });
  document.querySelector('#snapshots').addEventListener('input', (event) => {
    const card = event.target.closest('.snapshot-card');
    if (card && event.target.classList.contains('webhook-url')) update(card);
  });
  document.querySelector('#snapshots').addEventListener('click', async (event) => {
    const button = event.target.closest('.test-webhook');
    if (!button) return;
    const card = button.closest('.snapshot-card');
    const url = card.querySelector('.webhook-url').value.trim();
    const method = card.querySelector('.webhook-method').value === 'GET' ? 'GET' : 'POST';
    if (!url) return;
    button.disabled = true;
    try {
      await homebridge.request('/test-webhook', { url, method });
      homebridge.toast.success('Test Webhook sent successfully.', 'Webhook Test');
    } catch (error) {
      homebridge.toast.error(error?.message || 'Unable to send Test Webhook.', 'Webhook Test Failed');
    } finally {
      update(card);
    }
  });
  setTimeout(fill, 0);
})();
