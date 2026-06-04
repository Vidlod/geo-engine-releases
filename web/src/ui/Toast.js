/**
 * @fileoverview GEO Engine — Toast notification system.
 *
 * Creates ephemeral toasts in the `#toast-container`.
 * Auto-removes after 3 s with a smooth exit animation.
 *
 * @module ui/Toast
 */

/** Icon map for toast types. */
const ICONS = {
  success: '✓',
  error: '✗',
  info: 'ℹ',
};

/**
 * Show a toast message.
 *
 * @param {string} message — The text to display
 * @param {'success'|'error'|'info'} [type='info'] — Visual variant
 * @param {number} [duration=3000] — Auto-dismiss time in ms
 */
export function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toast-container');
  if (!container) {
    console.warn('[Toast] #toast-container not found');
    return;
  }

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');

  const icon = document.createElement('span');
  icon.className = 'toast__icon';
  icon.textContent = ICONS[type] ?? ICONS.info;

  const msg = document.createElement('span');
  msg.textContent = message;

  toast.append(icon, msg);
  container.appendChild(toast);

  // Schedule removal
  const timer = setTimeout(() => dismiss(toast), duration);

  // Allow click-to-dismiss
  toast.addEventListener('click', () => {
    clearTimeout(timer);
    dismiss(toast);
  });
}

/**
 * Dismiss a toast element with exit animation.
 * @param {HTMLElement} toast
 */
function dismiss(toast) {
  if (toast.classList.contains('toast--out')) return;
  toast.classList.add('toast--out');
  toast.addEventListener('animationend', () => toast.remove(), { once: true });
  // Fallback in case animationend doesn't fire
  setTimeout(() => toast.remove(), 300);
}
