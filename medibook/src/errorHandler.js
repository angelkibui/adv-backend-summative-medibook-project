// Part G — i18n/l10n course feedback page.
// All user-visible strings come from locales/<lang>.json; an unsupported
// ?lang value falls back to English. The date is formatted for the active
// locale with Intl.DateTimeFormat.
const path = require('path');

const SUPPORTED = ['en', 'fr'];
const LOCALES = {
  en: require('../../locales/en.json'),
  fr: require('../../locales/fr.json'),
};
const BCP47 = { en: 'en-GB', fr: 'fr-FR' };

function pickLocale(query) {
  return SUPPORTED.includes(query) ? query : 'en';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function page(lang, t, inner) {
  const today = new Intl.DateTimeFormat(BCP47[lang], { dateStyle: 'full' }).format(new Date());
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(t.title)}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; color: #1a1a2e; }
    h1 { color: #0f4c81; }
    .date { color: #666; margin-bottom: 1.5rem; }
    label { display: block; font-weight: 600; margin: 1.25rem 0 0.35rem; }
    textarea { width: 100%; min-height: 90px; padding: 0.5rem; border: 1px solid #bbb; border-radius: 6px; font: inherit; box-sizing: border-box; }
    button { margin-top: 1.5rem; padding: 0.7rem 1.6rem; background: #0f4c81; color: #fff; border: 0; border-radius: 6px; font-size: 1rem; cursor: pointer; }
    nav { margin-bottom: 1rem; font-size: 0.9rem; }
  </style>
</head>
<body>
  <nav><a href="/feedback">English</a> · <a href="/feedback?lang=fr">Français</a></nav>
  <h1>${escapeHtml(t.title)}</h1>
  <p>${escapeHtml(t.instructions)}</p>
  <p class="date">${escapeHtml(t.date_label)}: ${escapeHtml(today)}</p>
  ${inner}
</body>
</html>`;
}

function renderForm(req, res) {
  const lang = pickLocale(req.query.lang);
  const t = LOCALES[lang];
  const questions = t.questions
    .map(
      (q, i) => `
    <label for="q${i + 1}">${i + 1}. ${escapeHtml(q)}</label>
    <textarea id="q${i + 1}" name="q${i + 1}" required></textarea>`
    )
    .join('\n');
  const form = `
  <form method="POST" action="/feedback?lang=${lang}">
    ${questions}
    <button type="submit">${escapeHtml(t.submit_label)}</button>
  </form>`;
  res.send(page(lang, t, form));
}

function handleSubmit(req, res) {
  const lang = pickLocale(req.query.lang);
  const t = LOCALES[lang];
  res.send(page(lang, t, `<p><strong>${escapeHtml(t.thank_you)}</strong></p>`));
}

module.exports = { renderForm, handleSubmit };
