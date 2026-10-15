#!/usr/bin/env node
// OFFLINE generator. Reads the service menu snapshot and writes build/*.json. No network calls.
//   node scripts/build_artifacts.mjs [path/to/snapshot.json]
// Outputs:
//   build/hubdb/*.json      HubDB tables (generic shape: {name,label,columns,rows:[{col:value}]})
//   build/products.json     one product per module (+ Project Management)
//   build/properties.json   dropdown options for the quote properties
//   build/report.json       validation findings and the section 6 sample check

import fs from 'node:fs';
import path from 'node:path';

const SNAP = process.argv[2] || 'data/ppc_service_menu_snapshot_2026-10-15.json';
const OUT = 'build';
const RATE = 225;
const PALETTE = [
  ['blue', '#0B57FF', '#FFFFFF'],
  ['violet', '#7A73FF', '#FFFFFF'],
  ['cyan', '#00D4FE', '#002C59'], // navy text on cyan, never white
  ['navy', '#002C59', '#FFFFFF'],
  ['steel', '#275899', '#FFFFFF'],
];
const MONTHLY = new Set(['ongoing-support-fractional-revops']);
const TIERS = ['essential', 'standard', 'advanced'];

const snap = JSON.parse(fs.readFileSync(SNAP, 'utf8'));
const W = [...snap.workstreams].sort((a, b) => a.order - b.order);
const M = snap.modules;
const mod = Object.fromEntries(M.map((m) => [m.module_id, m]));
const report = { findings: [], sample: {} };
const warn = (msg) => report.findings.push(msg);

const write = (rel, obj) => {
  const p = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n');
};

// ---------- validation ----------
for (const w of W) for (const x of w.modules) {
  if (!mod[x.module_id]) warn(`workstream ${w.workstream_id}: unknown module ${x.module_id}`);
}
for (const m of M) {
  if (!Object.keys(m.tiers || {}).length && m.module_id !== 'project-management') warn(`no tiers (cannot be priced): ${m.module_id}`);
  if (!m.competency && m.family !== 'Engagement') warn(`no competency (excluded from FORM journey): ${m.module_id}`);
  if (!W.some((w) => w.modules.some((x) => x.module_id === m.module_id)) && m.module_id !== 'project-management') warn(`not in any workstream: ${m.module_id}`);
}

// ---------- HubDB ----------
write('hubdb/ppc_workstreams.json', {
  name: 'ppc_workstreams', label: 'PPC Workstreams',
  columns: [
    ['workstream_id', 'TEXT'], ['name', 'TEXT'], ['ws_order', 'NUMBER'], ['form_stages', 'TEXT'], ['description', 'TEXT'],
    ['audience', 'TEXT'], ['include_pm', 'BOOLEAN'], ['pm_pct', 'NUMBER'], ['color', 'TEXT'], ['ink', 'TEXT'], ['status', 'TEXT'],
  ].map(([name, type]) => ({ name, label: name, type })),
  rows: W.map((w, i) => {
    const [, hex, ink] = PALETTE[i % PALETTE.length];
    return { workstream_id: w.workstream_id, name: w.name, ws_order: w.order, form_stages: (w.form_stages || []).join(','),
      description: w.description, audience: w.audience, include_pm: !!w.include_pm, pm_pct: w.pm_pct, color: hex, ink, status: w.status };
  }),
});

write('hubdb/ppc_workstream_modules.json', {
  name: 'ppc_workstream_modules', label: 'PPC Workstream Modules',
  columns: ['workstream_id', 'module_id', 'module_name', 'role', 'default_tier'].map((name) => ({ name, label: name, type: 'TEXT' })),
  rows: W.flatMap((w) => w.modules.map((x) => ({ workstream_id: w.workstream_id, module_id: x.module_id, module_name: x.module, role: x.role, default_tier: x.default_tier || '' }))),
});

write('hubdb/ppc_module_tiers.json', {
  name: 'ppc_module_tiers', label: 'PPC Module Tiers',
  columns: [['module_id', 'TEXT'], ['module_name', 'TEXT'], ['tier', 'TEXT'], ['hours_low', 'NUMBER'], ['hours_high', 'NUMBER'], ['includes', 'TEXT']]
    .map(([name, type]) => ({ name, label: name, type })),
  rows: M.flatMap((m) => TIERS.filter((t) => m.tiers && m.tiers[t]).map((t) => ({
    module_id: m.module_id, module_name: m.name, tier: t, hours_low: m.tiers[t].hours_low, hours_high: m.tiers[t].hours_high,
    includes: (m.tiers[t].includes || []).join(' · '),
  }))),
});

write('hubdb/ppc_quote_settings.json', {
  name: 'ppc_quote_settings', label: 'PPC Quote Settings',
  columns: [['hourly_rate', 'NUMBER'], ['currency', 'TEXT'], ['pm_rounding', 'TEXT']].map(([name, type]) => ({ name, label: name, type })),
  rows: [{ hourly_rate: RATE, currency: 'USD', pm_rounding: 'nearest hour, halves up' }],
});

write('hubdb/ppc_quote_outcomes.json', {
  name: 'ppc_quote_outcomes', label: 'PPC Quote Outcomes',
  columns: ['key', 'headline', 'proof'].map((name) => ({ name, label: name, type: 'TEXT' })),
  rows: [
    { key: 'forecast', headline: 'A forecast you can defend', proof: 'Run the weekly pipeline review from a dashboard, not anecdotes.' },
    { key: 'governed_quotes', headline: 'Faster, governed quotes', proof: 'Quotes built from one product library, with discount approvals built in.' },
    { key: 'durable_process', headline: 'A process that outlasts people', proof: 'Documented, trained and owned by your team, not held in one person\'s head.' },
  ],
});

// ---------- products ----------
write('products.json', M.map((m) => ({
  sku: `PPC-${m.module_id}`, name: m.name, price: RATE,
  recurringbillingfrequency: MONTHLY.has(m.module_id) ? 'monthly' : null,
  properties: {
    ppc_module_id: m.module_id, ppc_module_family: m.family, ppc_5c_stage: m.five_c,
    ppc_process_area: m.process_area || '', ppc_competency: m.competency || '', ppc_form_stages: (m.form || []).join(';'),
  },
})));

// ---------- property options ----------
const opt = (value, label, i) => ({ value, label, displayOrder: i, hidden: false });
// Option values mirror what is configured in the portal: the label is the value (HubSpot generated them),
// except ppc_workstream (workstream_id) and ppc_form_stages (single letter).
const optL = (arr) => arr.map((l, i) => opt(l, l, i));
write('properties.json', {
  ppc_workstream: W.map((w, i) => opt(w.workstream_id, w.name, i)),
  ppc_tier: optL(['Essential', 'Standard', 'Advanced']),
  ppc_module_role: optL(['Core', 'Default', 'Optional', 'PM']),
  ppc_module_family: optL([...new Set(M.map((m) => m.family))]),
  ppc_5c_stage: optL([...new Set(M.map((m) => m.five_c))]),
  ppc_form_stages: [['F', 'F - Foundation'], ['O', 'O - Operationalize'], ['R', 'R - Refine'], ['M', 'M - Multiply']].map(([v, l], i) => opt(v, l, i)),
});

// ---------- section 6 sample simulation ----------
const roundHalfUp = (n) => Math.floor(n + 0.5);
const hours = (id, tier, override) => override ?? mod[id].tiers[tier].hours_high;
const sample = [
  ['client-onboarding', 'onboarding-and-project-kickoff', 'standard'],
  ['sales-hub-launch', 'system-design-and-data-model', 'standard'],
  ['sales-hub-launch', 'core-crm-configuration', 'standard'],
  ['sales-hub-launch', 'sales-hub-setup-pipeline-and-activity', 'standard'],
  ['sales-hub-launch', 'lifecycle-configuration', 'essential'],
  ['sales-hub-launch', 'lead-and-lifecycle-management', 'standard'],
  ['sales-hub-launch', 'sales-pipeline-design-and-build', 'standard'],
  ['sales-hub-launch', 'sequences-templates-and-playbooks', 'essential'],
  ['sales-hub-launch', 'sales-pipeline-reporting-and-dashboards', 'standard'],
  ['sales-hub-launch', 'data-migration', 'standard'],
  ['quoting-cpq', 'cpq-quote-implementation', 'standard'],
  ['quoting-cpq', 'product-library-design', 'standard'],
];
const byWs = {};
for (const [ws, id, tier] of sample) (byWs[ws] ||= []).push({ id, tier, hrs: hours(id, tier) });
let totalHrs = 0;
const lines = {};
for (const [ws, items] of Object.entries(byWs)) {
  const sub = items.reduce((s, x) => s + x.hrs, 0);
  const incPm = W.find((w) => w.workstream_id === ws).include_pm;
  const pm = incPm ? roundHalfUp(sub * 0.15) : 0;
  lines[ws] = { moduleHours: sub, pmHours: pm, hours: sub + pm, amount: (sub + pm) * RATE };
  totalHrs += sub + pm;
}
const ongoing = mod['ongoing-support-fractional-revops'].tiers.essential;
report.sample = {
  lines, oneTimeHours: totalHrs, oneTimeAmount: totalHrs * RATE,
  expected: { hours: 310, amount: 69750 },
  matchesV2: totalHrs === 310 && totalHrs * RATE === 69750,
  supportEssentialTier: ongoing,
  supportNote: `Essential tier is ${ongoing.hours_low}-${ongoing.hours_high} hrs/mo. v2's $4,500/mo needs the rep to set 20 hrs; the hours_high default would give ${ongoing.hours_high * RATE}/mo.`,
};
report.counts = { workstreams: W.length, modules: M.length, productsToCreate: M.length, workstreamModuleRows: W.reduce((n, w) => n + w.modules.length, 0) };
write('report.json', report);

console.log(JSON.stringify({ counts: report.counts, sample: report.sample.matchesV2, findings: report.findings }, null, 2));
