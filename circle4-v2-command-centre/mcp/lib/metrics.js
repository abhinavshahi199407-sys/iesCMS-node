// Pure metric helpers shared by every tool. No I/O here.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Accepts "Jul-2026", "jul 2026", "July-2026" or "2026-07".
 * Returns { label: "Jul-2026", year, monthIndex } or null when unparseable.
 */
export function normalizeMonth(input) {
    if (!input) return null;
    const s = String(input).trim();

    let m = s.match(/^([A-Za-z]{3,9})[- ](\d{4})$/);
    if (m) {
        const idx = MONTHS.findIndex(x => m[1].toLowerCase().startsWith(x.toLowerCase()));
        if (idx === -1) return null;
        return { label: `${MONTHS[idx]}-${m[2]}`, year: Number(m[2]), monthIndex: idx };
    }

    m = s.match(/^(\d{4})-(\d{1,2})$/);
    if (m) {
        const idx = Number(m[2]) - 1;
        if (idx < 0 || idx > 11) return null;
        return { label: `${MONTHS[idx]}-${m[1]}`, year: Number(m[1]), monthIndex: idx };
    }

    return null;
}

/** "Jul-2026" -> "Jul-2025" */
export function lastYearMonthLabel(label) {
    const parsed = normalizeMonth(label);
    if (!parsed) return null;
    return `${MONTHS[parsed.monthIndex]}-${parsed.year - 1}`;
}

export function riskOf(achievementPct) {
    if (achievementPct == null || Number.isNaN(achievementPct)) return 'unknown';
    if (achievementPct < 50) return 'critical';
    if (achievementPct < 80) return 'watch';
    return 'good';
}

export function fmtINR(n) {
    if (n == null || Number.isNaN(n)) return '—';
    return new Intl.NumberFormat('en-IN', {
        style: 'currency', currency: 'INR', maximumFractionDigits: 0
    }).format(n);
}

export function round2(n) {
    return n == null ? null : Math.round(n * 100) / 100;
}

/**
 * Aggregate a set of normalized MGR rows into district/circle KPIs.
 */
export function summarizeMgr(rows) {
    const total = (field) => rows.reduce((a, r) => a + (r[field] || 0), 0);
    const assigned = total('mgr_assigned');
    const lifted = total('mgr_lifted');
    const balance = total('balance');
    const achievementPct = assigned ? (lifted / assigned) * 100 : null;

    const buckets = { 'below_50_pct': 0, '50_to_75_pct': 0, '75_to_100_pct': 0, 'at_or_above_100_pct': 0 };
    for (const r of rows) {
        const a = r.achievement ?? 0;
        if (a < 50) buckets.below_50_pct++;
        else if (a < 75) buckets['50_to_75_pct']++;
        else if (a < 100) buckets['75_to_100_pct']++;
        else buckets.at_or_above_100_pct++;
    }

    const sorted = [...rows].sort((a, b) => (a.achievement ?? 0) - (b.achievement ?? 0));
    return {
        shop_count: rows.length,
        mgr_assigned_total: round2(assigned),
        mgr_lifted_total: round2(lifted),
        balance_total: round2(balance),
        achievement_pct: round2(achievementPct),
        achievement_distribution: buckets,
        weakest_shop: sorted[0] ? { shop_id: sorted[0].shop_id, shop_name: sorted[0].shop_name, achievement_pct: sorted[0].achievement } : null,
        strongest_shop: sorted.at(-1) ? { shop_id: sorted.at(-1).shop_id, shop_name: sorted.at(-1).shop_name, achievement_pct: sorted.at(-1).achievement } : null
    };
}

/**
 * Rule-based alerts derived from MGR rows — used when no alerts table is
 * connected. Mirrors the dashboard's risk rules.
 */
export function deriveMgrAlerts(rows) {
    const alerts = [];
    for (const r of rows) {
        const a = r.achievement;
        if (a == null) continue;
        if (a < 50) {
            alerts.push({
                severity: 'critical', rule_code: 'MGR_PACE_CRITICAL',
                circle: r.circle, shop_id: r.shop_id,
                message: `${r.shop_name} (${r.shop_id}) MGR achievement ${round2(a)}% — below 50% for ${r.month}; balance to lift ${fmtINR(r.balance)}`
            });
        } else if (a < 80) {
            alerts.push({
                severity: 'watch', rule_code: 'MGR_PACE_WATCH',
                circle: r.circle, shop_id: r.shop_id,
                message: `${r.shop_name} (${r.shop_id}) MGR achievement ${round2(a)}% — below 80% for ${r.month}`
            });
        }
    }
    return alerts;
}
