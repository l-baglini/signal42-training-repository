'use strict';

// ---------- CSV parsing (RFC 4180-ish: quoted fields, escaped quotes, embedded commas/newlines) ----------

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  function pushField() {
    row.push(field);
    field = '';
  }
  function pushRow() {
    pushField();
    rows.push(row);
    row = [];
  }

  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ',') { pushField(); i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { pushRow(); i++; continue; }
    field += c; i++;
  }
  if (inQuotes) throw new Error('Unterminated quoted field');

  // trailing field/row (only if there's content or an in-progress row)
  if (field.length > 0 || row.length > 0) pushRow();

  // drop fully-empty trailing rows (common from trailing newline)
  while (rows.length && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') {
    rows.pop();
  }

  if (rows.length === 0) throw new Error('CSV has no rows');

  const headers = rows[0];
  const dataRows = rows.slice(1).map((r) => {
    const padded = r.slice();
    while (padded.length < headers.length) padded.push('');
    return padded;
  });

  return { headers, rows: dataRows };
}

function looksLikeJson(text) {
  const t = text.trim();
  return t.startsWith('{') || t.startsWith('[');
}

function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function parseInput(text, formatOverride) {
  const trimmed = stripBom(text).trim();
  if (trimmed === '') throw new Error('Input is empty');

  const format = formatOverride === 'auto' || !formatOverride
    ? (looksLikeJson(trimmed) ? 'json' : 'csv')
    : formatOverride;

  if (format === 'json') {
    try {
      return { format: 'json', value: JSON.parse(trimmed) };
    } catch (e) {
      throw new Error(`JSON parse error: ${e.message}`);
    }
  }

  try {
    const parsed = parseCsv(trimmed);
    return { format: 'csv', headers: parsed.headers, rows: parsed.rows };
  } catch (e) {
    throw new Error(`CSV parse error: ${e.message}`);
  }
}

// ---------- JSON structural diff ----------

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function formatPath(path) {
  return path.length === 0 ? '$' : '$' + path;
}

function diffJson(left, right, pathStr = '') {
  const entries = [];
  const tLeft = typeOf(left);
  const tRight = typeOf(right);

  if (tLeft !== tRight) {
    entries.push({
      kind: 'type-changed',
      path: formatPath(pathStr),
      oldValue: left,
      newValue: right,
      oldType: tLeft,
      newType: tRight,
    });
    return entries;
  }

  if (tLeft === 'object') {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    const allKeys = Array.from(new Set([...leftKeys, ...rightKeys])).sort();
    for (const key of allKeys) {
      const childPath = `${pathStr}.${key}`;
      const inLeft = Object.prototype.hasOwnProperty.call(left, key);
      const inRight = Object.prototype.hasOwnProperty.call(right, key);
      if (inLeft && !inRight) {
        entries.push({ kind: 'removed', path: formatPath(childPath), oldValue: left[key], newValue: undefined });
      } else if (!inLeft && inRight) {
        entries.push({ kind: 'added', path: formatPath(childPath), oldValue: undefined, newValue: right[key] });
      } else {
        entries.push(...diffJson(left[key], right[key], childPath));
      }
    }
    return entries;
  }

  if (tLeft === 'array') {
    const maxLen = Math.max(left.length, right.length);
    for (let idx = 0; idx < maxLen; idx++) {
      const childPath = `${pathStr}[${idx}]`;
      const inLeft = idx < left.length;
      const inRight = idx < right.length;
      if (inLeft && !inRight) {
        entries.push({ kind: 'removed', path: formatPath(childPath), oldValue: left[idx], newValue: undefined });
      } else if (!inLeft && inRight) {
        entries.push({ kind: 'added', path: formatPath(childPath), oldValue: undefined, newValue: right[idx] });
      } else {
        entries.push(...diffJson(left[idx], right[idx], childPath));
      }
    }
    return entries;
  }

  // primitive
  if (left !== right) {
    entries.push({ kind: 'changed', path: formatPath(pathStr), oldValue: left, newValue: right });
  }
  return entries;
}

// ---------- CSV structural diff ----------

function diffCsv(leftParsed, rightParsed, keyColumn) {
  const entries = [];
  const leftHeaders = leftParsed.headers;
  const rightHeaders = rightParsed.headers;

  const addedCols = rightHeaders.filter((h) => !leftHeaders.includes(h));
  const removedCols = leftHeaders.filter((h) => !rightHeaders.includes(h));
  for (const col of addedCols) {
    entries.push({ kind: 'column-added', path: `column "${col}"`, oldValue: undefined, newValue: '(new column)' });
  }
  for (const col of removedCols) {
    entries.push({ kind: 'column-removed', path: `column "${col}"`, oldValue: '(removed column)', newValue: undefined });
  }

  function buildIndexMap(headers) {
    const map = new Map();
    headers.forEach((h, i) => {
      if (!map.has(h)) map.set(h, []);
      map.get(h).push(i);
    });
    return map;
  }

  const leftIndexMap = buildIndexMap(leftHeaders);
  const rightIndexMap = buildIndexMap(rightHeaders);

  // Pair up shared columns by occurrence, so duplicate header names (a real
  // export artifact) each get their own left/right index instead of every
  // occurrence resolving to the first match.
  const sharedColNames = Array.from(new Set(leftHeaders.filter((h) => rightHeaders.includes(h))));
  const sharedColPairs = [];
  for (const name of sharedColNames) {
    const leftIdxs = leftIndexMap.get(name);
    const rightIdxs = rightIndexMap.get(name);
    const count = Math.min(leftIdxs.length, rightIdxs.length);
    for (let k = 0; k < count; k++) {
      sharedColPairs.push({ name, leftIdx: leftIdxs[k], rightIdx: rightIdxs[k] });
    }
  }

  function rowObj(headers, row) {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  }

  const warnings = [];

  if (keyColumn && leftHeaders.includes(keyColumn) && rightHeaders.includes(keyColumn)) {
    const keyLeftIdx = leftHeaders.indexOf(keyColumn);
    const keyRightIdx = rightHeaders.indexOf(keyColumn);

    const leftMap = new Map();
    leftParsed.rows.forEach((row) => {
      const key = row[keyLeftIdx];
      if (leftMap.has(key)) warnings.push(`Duplicate key "${key}" in original — first occurrence used`);
      else leftMap.set(key, row);
    });
    const rightMap = new Map();
    rightParsed.rows.forEach((row) => {
      const key = row[keyRightIdx];
      if (rightMap.has(key)) warnings.push(`Duplicate key "${key}" in modified — first occurrence used`);
      else rightMap.set(key, row);
    });

    const allKeys = Array.from(new Set([...leftMap.keys(), ...rightMap.keys()]));
    for (const key of allKeys) {
      const leftRow = leftMap.get(key);
      const rightRow = rightMap.get(key);
      if (leftRow && !rightRow) {
        entries.push({ kind: 'removed', path: `Row (${keyColumn}=${key}) — entire row`, oldValue: rowObj(leftHeaders, leftRow), newValue: undefined });
        continue;
      }
      if (!leftRow && rightRow) {
        entries.push({ kind: 'added', path: `Row (${keyColumn}=${key}) — entire row`, oldValue: undefined, newValue: rowObj(rightHeaders, rightRow) });
        continue;
      }
      for (const pair of sharedColPairs) {
        if (pair.name === keyColumn) continue;
        const oldVal = leftRow[pair.leftIdx];
        const newVal = rightRow[pair.rightIdx];
        if (oldVal !== newVal) {
          entries.push({ kind: 'changed', path: `Row (${keyColumn}=${key}) → column "${pair.name}"`, oldValue: oldVal, newValue: newVal });
        }
      }
    }
  } else {
    const maxLen = Math.max(leftParsed.rows.length, rightParsed.rows.length);
    for (let i = 0; i < maxLen; i++) {
      const leftRow = leftParsed.rows[i];
      const rightRow = rightParsed.rows[i];
      const rowNum = i + 1;
      if (leftRow && !rightRow) {
        entries.push({ kind: 'removed', path: `Row ${rowNum} — entire row`, oldValue: rowObj(leftHeaders, leftRow), newValue: undefined });
        continue;
      }
      if (!leftRow && rightRow) {
        entries.push({ kind: 'added', path: `Row ${rowNum} — entire row`, oldValue: undefined, newValue: rowObj(rightHeaders, rightRow) });
        continue;
      }
      for (const pair of sharedColPairs) {
        const oldVal = leftRow[pair.leftIdx];
        const newVal = rightRow[pair.rightIdx];
        if (oldVal !== newVal) {
          entries.push({ kind: 'changed', path: `Row ${rowNum} → column "${pair.name}"`, oldValue: oldVal, newValue: newVal });
        }
      }
    }
  }

  return { entries, warnings };
}

// ---------- UI wiring ----------

const els = {
  leftText: document.getElementById('leftText'),
  rightText: document.getElementById('rightText'),
  leftFormat: document.getElementById('leftFormat'),
  rightFormat: document.getElementById('rightFormat'),
  leftFile: document.getElementById('leftFile'),
  rightFile: document.getElementById('rightFile'),
  keyColumnRow: document.getElementById('keyColumnRow'),
  keyColumnSelect: document.getElementById('keyColumnSelect'),
  compareBtn: document.getElementById('compareBtn'),
  exampleBtn: document.getElementById('exampleBtn'),
  exportMdBtn: document.getElementById('exportMdBtn'),
  exportJsonBtn: document.getElementById('exportJsonBtn'),
  errorBanner: document.getElementById('errorBanner'),
  summary: document.getElementById('summary'),
  filterInput: document.getElementById('filterInput'),
  diffList: document.getElementById('diffList'),
};

let lastEntries = [];
let lastWarnings = [];

function showError(message) {
  els.errorBanner.textContent = message;
  els.errorBanner.classList.add('visible');
}
function clearError() {
  els.errorBanner.textContent = '';
  els.errorBanner.classList.remove('visible');
}

function formatValue(v) {
  if (v === undefined) return '—';
  if (typeof v === 'object' && v !== null) return JSON.stringify(v, null, 2);
  return String(v);
}

function renderSummary(entries) {
  const counts = { added: 0, removed: 0, changed: 0, 'type-changed': 0, 'column-added': 0, 'column-removed': 0 };
  for (const e of entries) counts[e.kind] = (counts[e.kind] || 0) + 1;

  els.summary.innerHTML = '';
  const chips = [
    ['added', `+${counts.added} added`],
    ['removed', `−${counts.removed} removed`],
    ['changed', `~${counts.changed + counts['type-changed']} changed`],
  ];
  if (counts['column-added'] || counts['column-removed']) {
    chips.push(['neutral', `columns: +${counts['column-added']} / −${counts['column-removed']}`]);
  }
  for (const [cls, label] of chips) {
    const span = document.createElement('span');
    span.className = `chip ${cls}`;
    span.textContent = label;
    els.summary.appendChild(span);
  }
}

function renderDiffList(entries, filterText) {
  els.diffList.innerHTML = '';

  if (lastWarnings.length) {
    const warn = document.createElement('div');
    warn.className = 'diff-entry changed';
    warn.innerHTML = `<div class="path">Warnings</div><div>${lastWarnings.map(escapeHtml).join('<br>')}</div>`;
    els.diffList.appendChild(warn);
  }

  const filtered = filterText
    ? entries.filter((e) => e.path.toLowerCase().includes(filterText.toLowerCase()))
    : entries;

  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = entries.length === 0
      ? 'No differences found — inputs are structurally identical.'
      : 'No entries match your filter.';
    els.diffList.appendChild(empty);
    return;
  }

  for (const entry of filtered) {
    const div = document.createElement('div');
    div.className = `diff-entry ${entry.kind}`;
    const head = document.createElement('div');
    head.className = 'path';
    head.textContent = entry.path;
    const tag = document.createElement('span');
    tag.className = 'kind-tag';
    tag.textContent = entry.kind.replace('-', ' ');
    head.appendChild(tag);
    div.appendChild(head);

    if (entry.kind === 'added') {
      const values = document.createElement('div');
      values.className = 'diff-values';
      values.innerHTML = `<div></div><div class="new"><pre>${escapeHtml(formatValue(entry.newValue))}</pre></div>`;
      div.appendChild(values);
    } else if (entry.kind === 'removed') {
      const values = document.createElement('div');
      values.className = 'diff-values';
      values.innerHTML = `<div class="old"><pre>${escapeHtml(formatValue(entry.oldValue))}</pre></div><div></div>`;
      div.appendChild(values);
    } else if (entry.kind === 'column-added' || entry.kind === 'column-removed') {
      // path already says it all
    } else {
      const values = document.createElement('div');
      values.className = 'diff-values';
      let extra = '';
      if (entry.kind === 'type-changed') {
        extra = ` (${entry.oldType} → ${entry.newType})`;
      }
      values.innerHTML = `<div class="old"><pre>${escapeHtml(formatValue(entry.oldValue))}${extra}</pre></div><div class="new"><pre>${escapeHtml(formatValue(entry.newValue))}</pre></div>`;
      div.appendChild(values);
    }

    els.diffList.appendChild(div);
  }
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function updateKeyColumnOptions(leftParsed, rightParsed) {
  if (leftParsed?.format !== 'csv' || rightParsed?.format !== 'csv') {
    els.keyColumnRow.classList.remove('visible');
    return;
  }
  const previousValue = els.keyColumnSelect.value;
  const shared = leftParsed.headers.filter((h) => rightParsed.headers.includes(h));
  els.keyColumnSelect.innerHTML = '<option value="">(none — positional)</option>' +
    shared.map((h) => `<option value="${escapeHtml(h)}">${escapeHtml(h)}</option>`).join('');
  if (shared.includes(previousValue)) els.keyColumnSelect.value = previousValue;
  els.keyColumnRow.classList.add('visible');
}

function runCompare() {
  clearError();
  let leftParsed, rightParsed;
  try {
    leftParsed = parseInput(els.leftText.value, els.leftFormat.value);
  } catch (e) {
    showError(`Original: ${e.message}`);
    return;
  }
  try {
    rightParsed = parseInput(els.rightText.value, els.rightFormat.value);
  } catch (e) {
    showError(`Modified: ${e.message}`);
    return;
  }

  if (leftParsed.format !== rightParsed.format) {
    showError(`Format mismatch: Original was detected/selected as ${leftParsed.format.toUpperCase()}, Modified as ${rightParsed.format.toUpperCase()}. Both sides must be the same format.`);
    return;
  }

  updateKeyColumnOptions(leftParsed, rightParsed);

  let entries, warnings = [];
  if (leftParsed.format === 'json') {
    entries = diffJson(leftParsed.value, rightParsed.value);
  } else {
    const result = diffCsv(leftParsed, rightParsed, els.keyColumnSelect.value);
    entries = result.entries;
    warnings = result.warnings;
  }

  lastEntries = entries;
  lastWarnings = warnings;
  renderSummary(entries);
  renderDiffList(entries, els.filterInput.value);
}

function loadFile(input, textarea) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => { textarea.value = reader.result; };
  reader.readAsText(file);
}

function triggerDownload(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function toMarkdownReport(entries) {
  const lines = ['# Diff report', ''];
  const groups = [
    ['added', 'Added'],
    ['removed', 'Removed'],
    ['changed', 'Changed'],
    ['type-changed', 'Type changed'],
    ['column-added', 'Columns added'],
    ['column-removed', 'Columns removed'],
  ];
  if (entries.length === 0) {
    lines.push('No differences found.');
    return lines.join('\n');
  }
  for (const [kind, label] of groups) {
    const items = entries.filter((e) => e.kind === kind);
    if (items.length === 0) continue;
    lines.push(`## ${label} (${items.length})`, '');
    for (const e of items) {
      if (kind === 'added') lines.push(`- \`${e.path}\` → ${formatValue(e.newValue)}`);
      else if (kind === 'removed') lines.push(`- \`${e.path}\` (was ${formatValue(e.oldValue)})`);
      else if (kind === 'column-added' || kind === 'column-removed') lines.push(`- ${e.path}`);
      else lines.push(`- \`${e.path}\`: ${formatValue(e.oldValue)} → ${formatValue(e.newValue)}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

els.compareBtn.addEventListener('click', runCompare);

els.filterInput.addEventListener('input', () => {
  renderDiffList(lastEntries, els.filterInput.value);
});

els.leftFile.addEventListener('change', () => loadFile(els.leftFile, els.leftText));
els.rightFile.addEventListener('change', () => loadFile(els.rightFile, els.rightText));

els.keyColumnSelect.addEventListener('change', runCompare);

els.exportMdBtn.addEventListener('click', () => {
  triggerDownload('diff-report.md', toMarkdownReport(lastEntries), 'text/markdown');
});
els.exportJsonBtn.addEventListener('click', () => {
  triggerDownload('diff-report.json', JSON.stringify(lastEntries, null, 2), 'application/json');
});

const EXAMPLE_JSON_LEFT = JSON.stringify({
  name: 'Acme Widget',
  price: 19.99,
  tags: ['sale', 'featured'],
  stock: { warehouse: 12, backorder: false },
}, null, 2);

const EXAMPLE_JSON_RIGHT = JSON.stringify({
  name: 'Acme Widget',
  price: 24.99,
  tags: ['sale'],
  stock: { warehouse: 12, backorder: true },
  discontinued: false,
}, null, 2);

const EXAMPLE_CSV_LEFT = 'id,name,price\n1,Widget,19.99\n2,Gadget,9.99\n3,Sprocket,4.50\n';
const EXAMPLE_CSV_RIGHT = 'id,name,price\n1,Widget,24.99\n3,Sprocket,4.50\n4,Gizmo,14.00\n';

els.exampleBtn.addEventListener('click', () => {
  const useCsv = els.exampleBtn.dataset.next === 'csv';
  els.leftText.value = useCsv ? EXAMPLE_CSV_LEFT : EXAMPLE_JSON_LEFT;
  els.rightText.value = useCsv ? EXAMPLE_CSV_RIGHT : EXAMPLE_JSON_RIGHT;
  els.leftFormat.value = 'auto';
  els.rightFormat.value = 'auto';
  els.exampleBtn.dataset.next = useCsv ? 'json' : 'csv';
  els.exampleBtn.textContent = useCsv ? 'Load JSON example' : 'Load CSV example';
  runCompare();
});
