/**
 * Imported contacts service — parsers + normalizers + validators.
 *
 * Supports three input sources: manual text, CSV, VCF.
 * Output is always an array of { phone, display_name|null } with normalized phones.
 *
 * Phone normalization rules:
 *  - Strip all non-digits except leading "+"
 *  - If starts with "00" → treat the rest as international, drop the "00"
 *  - If starts with "0" and has 9-10 digits → prepend "972" (Israeli local)
 *  - Must be 8-15 digits total (E.164-ish range, accepts international)
 *  - Reject obvious garbage (too short, all zeros, etc.)
 */

const PHONE_MIN_DIGITS = 8;
const PHONE_MAX_DIGITS = 15;

/**
 * Normalize a single phone-ish input to canonical digits-only form.
 * Returns null if invalid.
 */
function normalizePhone(raw) {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;

  // Keep a leading "+" marker, strip everything non-digit otherwise
  const hasPlus = s.startsWith('+');
  s = s.replace(/\D/g, '');
  if (!s) return null;

  // "00xxxxxxx" → international dial-out prefix, drop it
  if (s.startsWith('00')) s = s.slice(2);

  // Local Israeli format: "05xxxxxxxx" → "9725xxxxxxxx"
  // Only apply when no explicit "+" and we have 9-10 digits starting with 0.
  if (!hasPlus && s.startsWith('0') && s.length >= 9 && s.length <= 10) {
    s = '972' + s.slice(1);
  }

  if (s.length < PHONE_MIN_DIGITS || s.length > PHONE_MAX_DIGITS) return null;
  if (/^0+$/.test(s)) return null;

  return s;
}

/**
 * Parse manual text input: newlines, commas, semicolons, tabs all separate entries.
 * Each entry is just a phone (no name).
 */
function parseManualText(text) {
  if (!text) return [];
  const parts = String(text).split(/[\n,;\t]+/);
  const out = [];
  for (const part of parts) {
    const p = normalizePhone(part);
    if (p) out.push({ phone: p, display_name: null });
  }
  return out;
}

/**
 * Parse CSV content. Handles:
 *  - Optional header row (auto-detected: if first row has a "phone"-ish header)
 *  - Multi-column rows: tries each column, picks the first that normalizes
 *  - Optional name column (auto-detected as the column containing non-numeric text)
 *  - Comma, semicolon, or tab delimiters (auto-detected)
 */
function parseCsvText(text) {
  if (!text) return [];
  // Strip UTF-8 BOM
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

  const rawLines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (rawLines.length === 0) return [];

  // Auto-detect delimiter
  const sample = rawLines.slice(0, Math.min(5, rawLines.length)).join('\n');
  const commaCount = (sample.match(/,/g) || []).length;
  const semiCount = (sample.match(/;/g) || []).length;
  const tabCount = (sample.match(/\t/g) || []).length;
  let delim = ',';
  if (semiCount > commaCount && semiCount >= tabCount) delim = ';';
  else if (tabCount > commaCount && tabCount > semiCount) delim = '\t';

  const splitRow = (row) => {
    // Simple CSV split — handles quoted fields
    const cells = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === '"' ) {
        if (inQuote && row[i + 1] === '"') { cur += '"'; i++; }
        else inQuote = !inQuote;
      } else if (ch === delim && !inQuote) {
        cells.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    cells.push(cur);
    return cells.map(c => c.trim());
  };

  // Detect header: if no cell in the first row normalizes to a phone, treat it as header
  const firstCells = splitRow(rawLines[0]);
  const firstRowHasPhone = firstCells.some(c => normalizePhone(c));
  const headerCells = firstRowHasPhone ? null : firstCells.map(c => c.toLowerCase());

  let phoneColIdx = -1;
  let nameColIdx = -1;
  if (headerCells) {
    const phoneAliases = ['phone', 'telephone', 'tel', 'mobile', 'number', 'מספר', 'טלפון', 'נייד', 'פלאפון'];
    const nameAliases = ['name', 'fullname', 'full_name', 'first_name', 'display', 'שם', 'שם מלא'];
    for (let i = 0; i < headerCells.length; i++) {
      const h = headerCells[i];
      if (phoneColIdx === -1 && phoneAliases.some(a => h.includes(a))) phoneColIdx = i;
      if (nameColIdx === -1 && nameAliases.some(a => h.includes(a))) nameColIdx = i;
    }
  }

  const out = [];
  const dataLines = headerCells ? rawLines.slice(1) : rawLines;
  for (const line of dataLines) {
    const cells = splitRow(line);
    if (cells.length === 0) continue;

    let phone = null;
    let name = null;

    if (phoneColIdx >= 0 && cells[phoneColIdx] != null) {
      phone = normalizePhone(cells[phoneColIdx]);
    }

    // Fallback: try every cell, pick the first that normalizes
    if (!phone) {
      for (let i = 0; i < cells.length; i++) {
        const p = normalizePhone(cells[i]);
        if (p) { phone = p; if (phoneColIdx === -1) phoneColIdx = i; break; }
      }
    }

    if (!phone) continue;

    if (nameColIdx >= 0 && cells[nameColIdx]) {
      name = cells[nameColIdx].slice(0, 128);
    } else {
      // Heuristic: first non-phone, non-numeric cell that isn't the phone column
      for (let i = 0; i < cells.length; i++) {
        if (i === phoneColIdx) continue;
        const c = cells[i];
        if (c && !/^[\d\s+\-()]+$/.test(c)) { name = c.slice(0, 128); break; }
      }
    }

    out.push({ phone, display_name: name });
  }
  return out;
}

/**
 * Parse VCF (vCard) content.
 * Handles 2.1, 3.0, 4.0 — extracts TEL: values and FN/N: for names.
 * Supports multi-line folded values per RFC 5545.
 */
function parseVcfText(text) {
  if (!text) return [];
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

  // Unfold continuation lines (lines starting with space/tab are continuations)
  const unfolded = text.replace(/\r?\n[ \t]/g, '');
  const lines = unfolded.split(/\r?\n/);

  const out = [];
  let currentName = null;
  let currentPhones = [];

  const flushCard = () => {
    for (const p of currentPhones) {
      out.push({ phone: p, display_name: currentName });
    }
    currentName = null;
    currentPhones = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (/^BEGIN:VCARD/i.test(line)) {
      currentName = null;
      currentPhones = [];
      continue;
    }
    if (/^END:VCARD/i.test(line)) {
      flushCard();
      continue;
    }

    // FN (formatted name) is the easiest display name
    if (/^FN(?:;[^:]*)?:/i.test(line)) {
      const value = line.replace(/^FN(?:;[^:]*)?:/i, '').trim();
      if (value) currentName = decodeVcfValue(value).slice(0, 128);
      continue;
    }
    // N: family;given;middle;prefix;suffix — fallback if no FN
    if (!currentName && /^N(?:;[^:]*)?:/i.test(line)) {
      const value = line.replace(/^N(?:;[^:]*)?:/i, '').trim();
      const parts = value.split(';').map(p => decodeVcfValue(p.trim())).filter(Boolean);
      if (parts.length >= 2) currentName = `${parts[1]} ${parts[0]}`.trim().slice(0, 128);
      else if (parts.length === 1) currentName = parts[0].slice(0, 128);
      continue;
    }
    if (/^TEL(?:;[^:]*)?:/i.test(line)) {
      const value = line.replace(/^TEL(?:;[^:]*)?:/i, '').trim();
      const p = normalizePhone(value);
      if (p) currentPhones.push(p);
      continue;
    }
  }
  // In case file doesn't end with END:VCARD cleanly
  if (currentPhones.length > 0) flushCard();
  return out;
}

function decodeVcfValue(v) {
  if (!v) return '';
  // Handle quoted-printable + basic escape sequences (\n, \,, \;)
  let s = v;
  if (/=([0-9A-F]{2})/i.test(s)) {
    try {
      s = s.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (_, hex) =>
        String.fromCharCode(parseInt(hex, 16))
      );
      // If it was latin-encoded QP for UTF-8, try decoding as UTF-8
      try { s = decodeURIComponent(escape(s)); } catch {}
    } catch {}
  }
  return s.replace(/\\n/gi, ' ').replace(/\\,/g, ',').replace(/\\;/g, ';').trim();
}

/**
 * Dedupe an array of { phone, display_name } in-memory.
 * Keeps first occurrence of each phone; prefers the entry that has a name.
 */
function dedupeInMemory(entries) {
  const map = new Map();
  for (const e of entries) {
    if (!e || !e.phone) continue;
    const existing = map.get(e.phone);
    if (!existing) {
      map.set(e.phone, e);
    } else if (!existing.display_name && e.display_name) {
      map.set(e.phone, e);
    }
  }
  return Array.from(map.values());
}

module.exports = {
  normalizePhone,
  parseManualText,
  parseCsvText,
  parseVcfText,
  dedupeInMemory,
};
