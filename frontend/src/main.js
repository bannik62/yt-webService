const form = document.getElementById('form');
const input = document.getElementById('q');
const list = document.getElementById('results');
const hint = document.getElementById('hint');

function setHint(text, isError) {
  if (!text) {
    hint.hidden = true;
    hint.textContent = '';
    return;
  }
  hint.hidden = false;
  hint.textContent = text;
  hint.classList.toggle('error', Boolean(isError));
}

function formatDuration(seconds) {
  if (seconds == null || Number.isNaN(seconds)) return '—';
  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor(seconds / 3600);
  const parts = [h > 0 ? String(h).padStart(2, '0') : null, String(m).padStart(2, '0'), String(s).padStart(2, '0')].filter(
    Boolean
  );
  return h > 0 ? parts.join(':') : `${m}:${String(s).padStart(2, '0')}`;
}

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = input?.value.trim() ?? '';
  if (!q) return;

  list.innerHTML = '';
  setHint('Recherche…', false);

  try {
    const url = `/api/search?${new URLSearchParams({ q })}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(120_000)
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setHint(data?.error || `Erreur ${res.status}`, true);
      return;
    }

    setHint('', false);
    const items = data.items ?? [];

    if (items.length === 0) {
      setHint('Aucun résultat.', false);
      return;
    }

    for (const item of items) {
      const li = document.createElement('li');
      li.className = 'result';
      li.innerHTML = `
        <a class="result-link" href="${item.url}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a>
        <span class="result-meta">${escapeHtml(item.channel ?? '—')} · ${formatDuration(item.duration)}</span>
      `;
      list.appendChild(li);
    }
  } catch (err) {
    const name = err && typeof err === 'object' && 'name' in err ? err.name : '';
    if (name === 'TimeoutError' || name === 'AbortError') {
      setHint('Délai dépassé — vérifie que le backend tourne (npm run dev dans backend) et yt-dlp.', true);
    } else {
      setHint('Réseau ou serveur indisponible.', true);
    }
  }
});

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
