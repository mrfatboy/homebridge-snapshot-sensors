(() => {
  const isValidSnapshotUrl = (value) => {
    const trimmed = (value || '').trim();
    if (!trimmed) return false;
    try {
      const url = new URL(trimmed);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  };

  const validate = () => {
    const inputs = Array.from(document.querySelectorAll('.snapshot-card .snapshot-url'));
    const valid = inputs.every((input) => isValidSnapshotUrl(input.value));

    if (valid) {
      homebridge.enableSaveButton();
    } else {
      homebridge.disableSaveButton();
    }

    return valid;
  };

  const container = document.querySelector('#snapshots');
  if (container) {
    container.addEventListener('input', (event) => {
      if (event.target instanceof HTMLInputElement && event.target.classList.contains('snapshot-url')) {
        validate();
      }
    });
    container.addEventListener('change', (event) => {
      if (event.target instanceof HTMLInputElement && event.target.classList.contains('snapshot-url')) {
        validate();
      }
    });
  }

  // Validate once after the existing configuration UI has populated the cards.
  setTimeout(validate, 100);
  setTimeout(validate, 500);
})();
