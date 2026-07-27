/** Options page: one field, one key in chrome.storage.sync. */
import { normalizeOrigin } from './shared.js';

const $origin = document.getElementById('origin');
const $status = document.getElementById('status');

function say(text, kind) {
  $status.textContent = text;
  $status.className = `status${kind ? ` ${kind}` : ''}`;
}

async function load() {
  try {
    const { origin } = await chrome.storage.sync.get('origin');
    if (origin) $origin.value = origin;
  } catch {
    say('Could not read saved settings.', 'err');
  }
}

async function save() {
  const normalized = normalizeOrigin($origin.value);
  if (!normalized) {
    say('That does not look like a web address. Example: https://pharos.example.com', 'err');
    return;
  }
  try {
    await chrome.storage.sync.set({ origin: normalized });
    // Show what was actually stored, so a typo like a trailing path is visible.
    $origin.value = normalized;
    say(`Saved. Captures will open ${normalized}/capture`, 'ok');
  } catch {
    say('Could not save. Check that the browser allows extension storage.', 'err');
  }
}

document.getElementById('save').addEventListener('click', () => void save());
document.getElementById('open').addEventListener('click', async () => {
  const normalized = normalizeOrigin($origin.value);
  if (!normalized) {
    say('Enter your Pharos address first.', 'err');
    return;
  }
  await chrome.tabs.create({ url: normalized });
});
$origin.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') void save();
});

void load();
