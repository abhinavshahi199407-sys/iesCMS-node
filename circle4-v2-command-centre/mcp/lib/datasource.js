// Data-source layer. Two implementations behind one interface:
//
//   JsonDataSource  — reads normalized collector snapshots (*.json) from the
//                     project data/ folder. Zero-config default so the server
//                     works out of the box with the shipped sample snapshot.
//   PgDataSource    — reads the monitoring PostgreSQL database defined in
//                     sql/schema.sql. Connections are forced read-only via
//                     default_transaction_read_only=on; credentials stay in
//                     the environment, never in tool arguments or output.
//
// Both return rows in the collector's normalized shape:
//   { district, circle, month, shop_id, shop_name, license_type,
//     mgr_assigned, final_required, mgr_lifted, balance, achievement }

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deriveMgrAlerts } from './metrics.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const matchesCircle = (row, circle) => {
    if (!circle) return true;
    const want = String(circle).toLowerCase().replace(/[^a-z0-9]/g, '');
    const have = String(row.circle || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    // "4", "c4", "circle4", "Circle - 4" all match "Circle - 4"
    return have === want || have.endsWith(want) || have === `circle${want}` || want === `circle${have}`;
};

const num = (v) => {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
};

function normalizeRow(raw) {
    return {
        district: raw.district ?? null,
        circle: raw.circle ?? null,
        month: raw.month ?? null,
        shop_id: raw.shop_id ?? null,
        shop_name: raw.shop_name ?? raw.shop_id ?? null,
        license_type: raw.license_type ?? null,
        mgr_assigned: num(raw.mgr_assigned),
        final_required: num(raw.final_required),
        mgr_lifted: num(raw.mgr_lifted),
        balance: num(raw.balance),
        achievement: num(raw.achievement)
    };
}

export class JsonDataSource {
    constructor(dataDir) {
        this.dataDir = dataDir;
        this.kind = 'json-snapshot';
        this.description = `JSON snapshots in ${dataDir}`;
        this.snapshots = [];
        this.loadError = null;
        try {
            this.#load();
        } catch (err) {
            this.loadError = err.message;
        }
    }

    #load() {
        if (!existsSync(this.dataDir)) {
            this.loadError = `Data directory not found: ${this.dataDir}`;
            return;
        }
        for (const f of readdirSync(this.dataDir).filter(f => f.endsWith('.json')).sort()) {
            const full = join(this.dataDir, f);
            try {
                const doc = JSON.parse(readFileSync(full, 'utf8'));
                const rows = Array.isArray(doc.rows) ? doc.rows.map(normalizeRow) : [];
                if (rows.length) {
                    this.snapshots.push({
                        file: f,
                        source: doc.generated_from || f,
                        captured_at: statSync(full).mtime.toISOString(),
                        rows
                    });
                }
            } catch {
                // Skip unparseable files; they are surfaced via sourceInfo().
            }
        }
    }

    sourceInfo() {
        return {
            mode: this.kind,
            detail: this.description,
            snapshots: this.snapshots.map(s => ({ file: s.file, source: s.source, captured_at: s.captured_at, row_count: s.rows.length })),
            ...(this.loadError ? { load_error: this.loadError } : {})
        };
    }

    async getMgrRows({ circle, month } = {}) {
        let rows = this.snapshots.flatMap(s => s.rows);
        if (circle) rows = rows.filter(r => matchesCircle(r, circle));
        if (month) rows = rows.filter(r => String(r.month).toLowerCase() === String(month).toLowerCase());
        return rows;
    }

    async getDailySales() {
        // The daily-sales feed is a separate portal report the collector has
        // not been mapped to yet (docs/DATA_MAPPING.md items 1-4).
        return null;
    }

    async getAlerts({ circle, shopId } = {}) {
        let alerts = deriveMgrAlerts(this.snapshots.flatMap(s => s.rows));
        if (circle) alerts = alerts.filter(a => matchesCircle(a, circle));
        if (shopId) alerts = alerts.filter(a => String(a.shop_id).toLowerCase() === String(shopId).toLowerCase());
        return { alerts, derived: true };
    }

    async close() {}
}

export class PgDataSource {
    constructor(connectionString) {
        this.connectionString = connectionString;
        this.kind = 'postgres';
        this.description = 'monitoring PostgreSQL database (read-only session)';
        this.pool = null;
    }

    async #getPool() {
        if (!this.pool) {
            const { default: pg } = await import('pg');
            this.pool = new pg.Pool({
                connectionString: this.connectionString,
                max: 3,
                // Hard guarantee: every session this server opens is read-only.
                options: '-c default_transaction_read_only=on'
            });
        }
        return this.pool;
    }

    sourceInfo() {
        return { mode: this.kind, detail: this.description };
    }

    // Latest MGR snapshot per shop from report_snapshots (schema.sql).
    // The collector stores the normalized row in the metric jsonb column.
    async getMgrRows({ circle, month } = {}) {
        const pool = await this.#getPool();
        const params = [];
        let where = `report_type = 'MGR'`;
        if (circle) {
            params.push(`%${String(circle).replace(/[^a-zA-Z0-9 -]/g, '')}%`);
            where += ` and circle ilike $${params.length}`;
        }
        if (month) {
            params.push(String(month));
            where += ` and metric->>'month' = $${params.length}`;
        }
        const sql = `
            select distinct on (shop_id) shop_id, circle, district, cutoff_at, metric
            from report_snapshots
            where ${where}
            order by shop_id, cutoff_at desc`;
        const res = await pool.query(sql, params);
        return res.rows.map(r => normalizeRow({
            ...r.metric,
            shop_id: r.metric.shop_id ?? r.shop_id,
            circle: r.metric.circle ?? r.circle,
            district: r.metric.district ?? r.district
        }));
    }

    async getDailySales({ date, circle } = {}) {
        const pool = await this.#getPool();
        const params = [];
        let where = `report_type = 'DAILY_SALES'`;
        if (date) {
            params.push(date);
            where += ` and source_period = $${params.length}`;
        }
        if (circle) {
            params.push(`%${String(circle).replace(/[^a-zA-Z0-9 -]/g, '')}%`);
            where += ` and circle ilike $${params.length}`;
        }
        const sql = `
            select distinct on (shop_id) shop_id, circle, source_period, cutoff_at, metric
            from report_snapshots
            where ${where}
            order by shop_id, cutoff_at desc`;
        const res = await pool.query(sql, params);
        return res.rows.length ? res.rows : null;
    }

    async getAlerts({ circle, shopId } = {}) {
        const pool = await this.#getPool();
        const params = [];
        let where = 'closed_at is null';
        if (circle) {
            params.push(`%${String(circle).replace(/[^a-zA-Z0-9 -]/g, '')}%`);
            where += ` and circle ilike $${params.length}`;
        }
        if (shopId) {
            params.push(String(shopId));
            where += ` and shop_id = $${params.length}`;
        }
        const res = await pool.query(
            `select severity, rule_code, circle, shop_id, message, metric, opened_at
             from alerts where ${where} order by opened_at desc limit 200`, params);
        return { alerts: res.rows, derived: false };
    }

    async close() {
        if (this.pool) await this.pool.end();
    }
}

/**
 * Pick the data source from the environment:
 *   C4_DB_URL / DATABASE_URL  -> PostgreSQL (read-only)
 *   C4_DATA_DIR               -> JSON snapshot directory (default ../data)
 */
export function createDataSource(env = process.env) {
    const dbUrl = env.C4_DB_URL || env.DATABASE_URL;
    if (dbUrl) return new PgDataSource(dbUrl);
    const dataDir = resolve(env.C4_DATA_DIR || join(__dirname, '..', '..', 'data'));
    return new JsonDataSource(dataDir);
}
