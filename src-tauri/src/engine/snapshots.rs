//! SQLite snapshot store. One row per applied tweak with its captured
//! pre-state. Reverts replay from this store.
//!
//! DB lives at `<app_local_data_dir>/state.db`. Schema is created on first
//! open via `IF NOT EXISTS` so version drift across runs is fine until we
//! need a real migration.

use anyhow::Context;
use parking_lot::Mutex;
use rusqlite::{params, Connection, OptionalExtension};
use std::path::Path;
use std::sync::Arc;

use super::actions::{
    ApplyReceipt, AppliedTweak, TweakAction, VerificationResult, VerificationStatus,
};

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
    pre_state_json TEXT,
    verification_status TEXT NOT NULL DEFAULT 'unknown',
    verification_detail TEXT NOT NULL DEFAULT 'Verification has not run.'
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
        // Existing installs were created before live verification existed.
        // Keep them usable with a narrow, idempotent migration instead of
        // recreating or discarding the snapshot database.
        for statement in [
            "ALTER TABLE tweaks_applied ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'unknown'",
            "ALTER TABLE tweaks_applied ADD COLUMN verification_detail TEXT NOT NULL DEFAULT 'Verification has not run.'",
        ] {
            if let Err(e) = conn.execute(statement, []) {
                let msg = e.to_string().to_ascii_lowercase();
                if !msg.contains("duplicate column name") {
                    return Err(e).with_context(|| format!("migrating snapshot schema: {statement}"));
                }
            }
        }
        Ok(SnapshotStore {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    /// Read a value from the kv table. Returns None if the key is absent.
    /// Used for small persisted settings (restore-point toggle, last-applied
    /// OS build for update-drift detection).
    pub fn kv_get(&self, key: &str) -> anyhow::Result<Option<String>> {
        let conn = self.conn.lock();
        let v = conn
            .query_row("SELECT value FROM kv WHERE key = ?1", params![key], |r| {
                r.get::<_, String>(0)
            })
            .optional()?;
        Ok(v)
    }

    /// Upsert a value into the kv table.
    pub fn kv_set(&self, key: &str, value: &str) -> anyhow::Result<()> {
        let updated_at = chrono::Utc::now().to_rfc3339();
        let conn = self.conn.lock();
        conn.execute(
            "INSERT INTO kv (key, value, updated_at) VALUES (?1, ?2, ?3)
             ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = ?3",
            params![key, value, updated_at],
        )?;
        Ok(())
    }

    pub fn record_apply(
        &self,
        tweak_id: &str,
        action: &TweakAction,
        pre_state: &serde_json::Value,
        verification: &VerificationResult,
    ) -> anyhow::Result<ApplyReceipt> {
        let receipt_id = new_id();
        let applied_at = chrono::Utc::now().to_rfc3339();
        let action_json = serde_json::to_string(action)?;
        let pre_state_json = serde_json::to_string(pre_state)?;
        let kind = action.kind().to_string();
        let verification_status = verification_status_str(&verification.status);
        // A verification mismatch is not proof that no mutation occurred.
        // Keep the prepared receipt active so its captured pre-state remains
        // revertible and the drift/reapply UI can repair it. Verification
        // status controls whether Tune Now considers the action ready, not
        // whether rollback data is retained.
        let receipt_status = "applied";

        let conn = self.conn.lock();
        // Re-applying a drifted action must keep the original pre-state. If we
        // inserted a new receipt here, reverting that newer receipt would only
        // restore the drifted target value rather than the user's original
        // setting. Reuse the oldest active receipt for the exact same action
        // and retire any historical duplicates created by older builds.
        let existing = conn
            .query_row(
                "SELECT receipt_id, applied_at, action_kind
                 FROM tweaks_applied
                 WHERE tweak_id = ?1 AND status = 'applied' AND action_json = ?2
                 ORDER BY applied_at ASC
                 LIMIT 1",
                params![tweak_id, action_json],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                    ))
                },
            )
            .optional()?;

        if let Some((existing_id, existing_at, existing_kind)) = existing {
            conn.execute(
                "UPDATE tweaks_applied
                 SET verification_status = ?1, verification_detail = ?2
                 WHERE receipt_id = ?3 AND status = 'applied'",
                params![
                    verification_status,
                    verification.detail.as_str(),
                    existing_id
                ],
            )?;
            conn.execute(
                "UPDATE tweaks_applied
                 SET status = 'superseded'
                 WHERE tweak_id = ?1 AND status = 'applied' AND action_json = ?2 AND receipt_id <> ?3",
                params![tweak_id, action_json, existing_id],
            )?;
            return Ok(ApplyReceipt {
                receipt_id: existing_id,
                tweak_id: tweak_id.to_string(),
                applied_at: existing_at,
                kind: existing_kind,
                verification_status: verification.status.clone(),
                verification_detail: verification.detail.clone(),
            });
        }

        conn.execute(
            "INSERT INTO tweaks_applied (receipt_id, tweak_id, applied_at, status, action_kind, action_json, pre_state_json, verification_status, verification_detail)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                receipt_id,
                tweak_id,
                applied_at,
                receipt_status,
                kind,
                action_json,
                pre_state_json,
                verification_status,
                verification.detail.as_str(),
            ],
        )?;

        Ok(ApplyReceipt {
            receipt_id,
            tweak_id: tweak_id.to_string(),
            applied_at,
            kind,
            verification_status: verification.status.clone(),
            verification_detail: verification.detail.clone(),
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
            "SELECT receipt_id, tweak_id, applied_at, status, action_kind, verification_status, verification_detail
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
                verification_status: parse_verification_status(&row.get::<_, String>(5)?),
                verification_detail: row.get(6)?,
            })
        })?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r?);
        }
        Ok(out)
    }

    pub fn update_verification(
        &self,
        receipt_id: &str,
        verification: &VerificationResult,
    ) -> anyhow::Result<()> {
        let conn = self.conn.lock();
        let n = conn.execute(
            "UPDATE tweaks_applied SET verification_status = ?1, verification_detail = ?2 WHERE receipt_id = ?3 AND status = 'applied'",
            params![
                verification_status_str(&verification.status),
                verification.detail.as_str(),
                receipt_id
            ],
        )?;
        if n == 0 {
            return Err(anyhow::anyhow!(
                "receipt {receipt_id} not found or already reverted"
            ));
        }
        Ok(())
    }
}

fn verification_status_str(status: &VerificationStatus) -> &'static str {
    match status {
        VerificationStatus::Verified => "verified",
        VerificationStatus::Mismatch => "mismatch",
        VerificationStatus::Unknown => "unknown",
    }
}

fn parse_verification_status(value: &str) -> VerificationStatus {
    match value {
        "verified" => VerificationStatus::Verified,
        "mismatch" => VerificationStatus::Mismatch,
        _ => VerificationStatus::Unknown,
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::actions::{Hive, RegValueType};
    use serde_json::json;

    fn test_action() -> TweakAction {
        TweakAction::RegistrySet {
            hive: Hive::Hkcu,
            path: "Software\\Optimizationmaxxing\\SnapshotTest".to_string(),
            name: "Value".to_string(),
            value_type: RegValueType::Dword,
            value: json!(1),
        }
    }

    #[test]
    fn mismatch_receipt_stays_revertible_and_repair_keeps_baseline() {
        let dir = std::env::temp_dir().join(format!(
            "optimizationmaxxing-snapshot-test-{}",
            new_id()
        ));
        let store = SnapshotStore::open(&dir).expect("open snapshot store");
        let action = test_action();
        let mismatch = VerificationResult {
            status: VerificationStatus::Mismatch,
            detail: "read-back did not match".to_string(),
        };

        let first = store
            .record_apply("snapshot.test", &action, &json!({"old": 0}), &mismatch)
            .expect("record mismatch");
        let rows = store.list_applied().expect("list applied");
        let row = rows
            .iter()
            .find(|row| row.receipt_id == first.receipt_id)
            .expect("mismatch receipt row");
        assert_eq!(row.status, "applied");
        assert_eq!(row.verification_status, VerificationStatus::Mismatch);

        let (_, saved_pre) = store
            .get_receipt(&first.receipt_id)
            .expect("load mismatch receipt")
            .expect("mismatch receipt remains active");
        assert_eq!(saved_pre, json!({"old": 0}));

        let repaired = VerificationResult {
            status: VerificationStatus::Verified,
            detail: "read-back matched after repair".to_string(),
        };
        let second = store
            .record_apply("snapshot.test", &action, &json!({"old": 99}), &repaired)
            .expect("record repair");
        assert_eq!(second.receipt_id, first.receipt_id);
        assert_eq!(second.verification_status, VerificationStatus::Verified);

        let (_, repaired_pre) = store
            .get_receipt(&first.receipt_id)
            .expect("load repaired receipt")
            .expect("repaired receipt remains active");
        assert_eq!(repaired_pre, json!({"old": 0}));

        drop(store);
        let _ = std::fs::remove_dir_all(dir);
    }
}
