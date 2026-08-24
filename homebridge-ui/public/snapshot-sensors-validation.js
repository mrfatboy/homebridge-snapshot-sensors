(() => {
  function getCards() {
    return Array.from(document.querySelectorAll('.snapshot-card'));
  }

  function getInvalidUrls() {
    return getCards().filter((card) => {
      const input = card.querySelector('.snapshot-url');
      const value = input?.value.trim() || '';
      if (!value) return true;

      try {
        const url = new URL(value);
        return url.protocol !== 'http:' && url.protocol !== 'https:';
      } catch {
        return true;
      }
    });
  }

  function validateBeforeSave() {
    const invalidUrls = getInvalidUrls();
    if (!invalidUrls.length) return true;

    const hasEmpty = invalidUrls.some((card) => {
      const input = card.querySelector('.snapshot-url');
      return !(input?.value.trim());
    });

    homebridge.toast.error(
      hasEmpty
        ? 'Every Snapshot sensor must have a Snapshot URL.'
        : 'Every Snapshot sensor must have a valid Snapshot URL using http:// or https://.',
      hasEmpty ? 'Snapshot URL Required' : 'Invalid Snapshot URL'
    );

    const input = invalidUrls[0].querySelector('.snapshot-url');
    if (input) {
      input.focus();
      input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    return false;
  }

  function isThisPluginSaveButton(button) {
    const frame = window.frameElement;
    if (!frame || !button) return false;

    const modal = frame.closest('.modal');
    if (!modal || !modal.contains(button)) return false;

    const text = (button.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
    return text === 'save' || text.endsWith(' save');
  }

  try {
    const parentDocument = window.parent.document;

    parentDocument.addEventListener('click', (event) => {
      const target = event.target;
      const button = target instanceof Element ? target.closest('button') : null;

      if (!isThisPluginSaveButton(button)) return;
      if (validateBeforeSave()) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }, true);
  } catch (error) {
    console.warn('Unable to attach Snapshot Sensor Save validation:', error);
  }
})();
