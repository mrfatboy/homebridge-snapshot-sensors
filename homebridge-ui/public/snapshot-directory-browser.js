(() => {
  const snapshots = document.querySelector('#snapshots');
  if (!snapshots) return;

  const ensureBrowseButtons = () => {
    snapshots.querySelectorAll('.snapshot-directory-controls').forEach((controls) => {
      const input = controls.querySelector('.snapshot-directory');
      if (!input || controls.querySelector('.browse-snapshot-directory')) return;

      const row = document.createElement('div');
      row.className = 'd-flex align-items-center mt-2';
      row.style.gap = '0.5rem';

      input.parentElement.insertBefore(row, input);
      row.appendChild(input);
      input.classList.add('flex-grow-1');

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn-outline-secondary browse-snapshot-directory';
      button.textContent = 'BROWSE';
      button.title = 'Browse directories on the Homebridge host';
      row.appendChild(button);
    });
  };

  const closeModal = (modal, backdrop) => {
    modal.remove();
    backdrop?.remove();
  };

  const showBrowser = async (input) => {
    const modal = document.createElement('div');
    modal.className = 'modal fade show';
    modal.style.display = 'block';
    modal.style.backgroundColor = 'rgba(0, 0, 0, 0.45)';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');

    modal.innerHTML = `
      <div class="modal-dialog modal-lg modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Select Snapshot Directory</h5>
            <button type="button" class="btn-close directory-browser-close" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <div class="mb-3">
              <label class="form-label">Current directory</label>
              <div class="form-control directory-browser-path" style="overflow-x:auto;white-space:nowrap;"></div>
            </div>
            <div class="mb-3">
              <button type="button" class="btn btn-outline-secondary directory-browser-parent">⬆️ Parent Directory</button>
            </div>
            <div class="list-group directory-browser-list"></div>
            <div class="directory-browser-status text-muted mt-3"></div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary directory-browser-close">CANCEL</button>
            <button type="button" class="btn btn-primary directory-browser-select">SELECT THIS DIRECTORY</button>
          </div>
        </div>
      </div>`;

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop fade show';
    document.body.appendChild(backdrop);
    document.body.appendChild(modal);

    const pathElement = modal.querySelector('.directory-browser-path');
    const list = modal.querySelector('.directory-browser-list');
    const status = modal.querySelector('.directory-browser-status');
    const parentButton = modal.querySelector('.directory-browser-parent');
    const selectButton = modal.querySelector('.directory-browser-select');

    let currentPath = input.value.trim() || '/';
    let parentPath = '/';

    const loadDirectory = async (path) => {
      status.textContent = 'Loading...';
      list.innerHTML = '';
      parentButton.disabled = true;
      selectButton.disabled = true;

      try {
        const result = await homebridge.request('/browse', { path });
        currentPath = result.path;
        parentPath = result.parent;
        pathElement.textContent = currentPath;
        parentButton.disabled = currentPath === parentPath;
        selectButton.disabled = false;

        if (!result.directories?.length) {
          status.textContent = 'No subdirectories found.';
          return;
        }

        status.textContent = '';
        result.directories.forEach((directory) => {
          const item = document.createElement('button');
          item.type = 'button';
          item.className = 'list-group-item list-group-item-action';
          item.textContent = `📁 ${directory.name}`;
          item.addEventListener('click', () => loadDirectory(directory.path));
          list.appendChild(item);
        });
      } catch (error) {
        console.error('Snapshot Directory browse failed:', error);
        status.textContent = '';
        homebridge.toast.error(error?.message || 'Unable to browse this directory.', 'Directory Browse Failed');
      }
    };

    modal.querySelectorAll('.directory-browser-close').forEach((button) => {
      button.addEventListener('click', () => closeModal(modal, backdrop));
    });

    parentButton.addEventListener('click', () => loadDirectory(parentPath));

    selectButton.addEventListener('click', () => {
      input.value = currentPath;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      closeModal(modal, backdrop);
    });

    backdrop.addEventListener('click', () => closeModal(modal, backdrop));
    await loadDirectory(currentPath);
  };

  snapshots.addEventListener('click', (event) => {
    const button = event.target.closest('.browse-snapshot-directory');
    if (!button) return;
    const controls = button.closest('.snapshot-directory-controls');
    const input = controls?.querySelector('.snapshot-directory');
    if (input) showBrowser(input);
  });

  const observer = new MutationObserver(ensureBrowseButtons);
  observer.observe(snapshots, { childList: true, subtree: true });
  ensureBrowseButtons();
})();
