//! SQLite snapshot store. One row per applied tweak with its captured
//! pre-state. Reverts replay from this store.
//!
//! DB lives at `<app_local_data_dir>/state.db`. Schema is created on first
//! open via `IF NOT EXISTS` so version drift across runs is fine until we
//! need a real migration.

use anyhow::Context;
use parking_lot::Mutex;
use rusqlite::{params, Connection};
use std::path::Path;
use std::sync::Arc;

use super::actions::{ApplyReceipt, AppliedTweak, TweakAction};

#[derive(Clone)]
pub struct SnapshotStore {
    conn: Arc<Mutex<Connection>>,
}

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS tweaks_applied (
    receipt_id     TEXT PRIMARY KEY,
    tweak_id       TEXT NOT NULL,
    applied_at     TEXT NOT NULL,
    status         TEXT NOT NULL DEFAULT 'applied',
    action_kind    TEXT NOT NULL,
    action_json    TEXT NOT NULL,
    pre_state_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_applied_tweak  ON tweaks_applied(tweak_id);
CREATE INDEX IF NOT EXISTS idx_applied_status ON tweaks_applied(status);

CREATE TABLE IF NOT EXISTS checkpoints (
    checkpoint_id TEXT PRIMARY KEY,
    label         TEXT,
    created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS checkpoint_receipts (
    checkpoint_id TEXT NOT NULL,
    receipt_id    TEXT NOT NULL,
    PRIMARY KEY (checkpoint_id, receipt_id)
);

CREATE TABLE IF NOT EXISTS kv (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
"#;

impl SnapshotStore {
    pub fn open(app_local_data_dir: &Path) -> anyhow::Result<Self> {
        std::fs::create_dir_all(app_local_data_dir)
            .with_context(|| format!("creating data dir {}", app_local_data_dir.display()))?;
        let db_path = app_local_data_dir.join("state.db");
        let conn = Connection::open(&db_path)
            .with_context(|| format!("opening sqlite at {}", db_path.display()))?;
        conn.execute_batch(SCHEMA).context("creating schema")?;
        Ok(SnapshotStore {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    pub fn record_apply(
        &self,
        tweak_id: &str,
        action: &TweakAction,
        pre_state: &serde_json::Value,
    ) -> anyhow::Result<ApplyReceipt> {
        let receipt_id = new_id();
        let applied_at = chrono::Utc::now().to_rfc3339();
        let action_json = serde_json::to_string(action)?;
        let pre_state_json = serde_json::to_string(pre_state)?;
        let kind = action.kind().to_string();

        let conn = self.conn.lock();
        conn.execute(
            "INSERT INTO tweaks_applied (receipt_id, tweak_id, applied_at, status, action_kind, action_json, pre_state_json)
             VALUES (?1, ?2, ?3, 'applied', ?4, ?5, ?6)",
            params![receipt_id, tweak_id, applied_at, kind, action_json, pre_state_json],
        )?;

        Ok(ApplyReceipt {
            receipt_id,
            tweak_id: tweak_id.to_string(),
            applied_at,
            kind,
        })
    }

    pub fn mark_reverted(&self, receipt_id: &str) -> anyhow::Result<()> {
        let conn = self.conn.lock();
        let n = conn.execute(
            "UPDATE tweaks_applied SET status = 'reverted' WHERE receipt_id = ?1 AND status = 'applied'",
            params![receipt_id],
        )?;
        if n == 0 {
            return Err(anyhow::anyhow!(
                "receipt {receipt_id} not found or already reverted"
            ));
        }
        Ok(())
    }

    pub fn get_receipt(
        &self,
        receipt_id: &str,
    ) -> anyhow::Result<Option<(TweakAction, serde_json::Value)>> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT action_json, pre_state_json FROM tweaks_applied WHERE receipt_id = ?1 AND status = 'applied'",
        )?;
        let mut rows = stmt.query(params![receipt_id])?;
        if let Some(row) = rows.next()? {
            let action_json: String = row.get(0)?;
            let pre_state_json: Option<String> = row.get(1)?;
            let action: TweakAction = serde_json::from_str(&action_json)?;
            let pre_state: serde_json::Value = match pre_state_json {
                Some(s) => serde_json::from_str(&s)?,
                None => serde_json::Value::Null,
            };
            Ok(Some((action, pre_state)))
        } else {
            Ok(None)
        }
    }

    pub fn list_applied(&self) -> anyhow::Result<Vec<AppliedTweak>> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT receipt_id, tweak_id, applied_at, status, action_kind
             FROM tweaks_applied
             ORDER BY applied_at DESC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(AppliedTweak {
                receipt_id: row.get(0)?,
                tweak_id: row.get(1)?,
                applied_at: row.get(2)?,
                status: row.get(3)?,
                kind: row.get(4)?,
            })
        })?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r?);
        }
        Ok(out)
    }
}

fn new_id() -> String {
    // 16 hex chars from current time + counter; sufficient uniqueness for a
    // single-user desktop app. Replaceable with `uuid` crate later if needed.
    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let n = COUNTER.fetch_add(1, Ordering::Relaxed);
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("{:x}{:04x}", ts, n & 0xFFFF)
}
