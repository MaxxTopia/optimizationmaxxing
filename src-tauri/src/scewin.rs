//! Read-only parser for AMI SCEWIN's line-oriented setup script export.
//!
//! This module never opens files or writes firmware. The caller supplies
//! transient text and receives only a bounded, privacy-filtered summary.

use serde::Serialize;
use std::collections::HashMap;

const MAX_DUMP_BYTES: usize = 10 * 1024 * 1024;
const MAX_DUMP_LINES: usize = 500_000;
const MAX_SETTINGS: usize = 30_000;
const MAX_LABEL_CHARS: usize = 240;
const MAX_VALUE_CHARS: usize = 160;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScewinDump {
    pub entries: Vec<ScewinEntry>,
    pub omitted_sensitive_entries: usize,
    pub identity: Option<ScewinIdentity>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScewinEntry {
    /// Stable only within the same board/firmware export family; not a BIOS write token.
    pub comparison_key: String,
    pub question: String,
    pub current_value: Option<String>,
    pub default_value: Option<String>,
    /// `selected-option`, `value-field`, `conflict`, or `not-reported`.
    pub current_value_source: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScewinIdentity {
    pub board_manufacturer: Option<String>,
    pub board_product: Option<String>,
    pub board_revision: Option<String>,
    pub bios_version: Option<String>,
}

#[derive(Debug, Clone)]
struct RawEntry {
    question: String,
    token: Option<String>,
    offset: Option<String>,
    current_value: Option<String>,
    default_value: Option<String>,
    current_value_source: String,
}

#[derive(Debug, Clone)]
struct SelectedOption {
    code: String,
    label: String,
}

pub fn parse_scewin_dump(content: &str) -> Result<ScewinDump, String> {
    if content.len() > MAX_DUMP_BYTES {
        return Err("SCEWIN text is larger than the 10 MiB import limit.".into());
    }

    let lines: Vec<&str> = content.lines().take(MAX_DUMP_LINES + 1).collect();
    if lines.len() > MAX_DUMP_LINES {
        return Err("SCEWIN export contains more than 500,000 text lines; refusing an unexpectedly large or malformed file.".into());
    }
    let first_question =
        (0..lines.len()).find(|index| is_field_at(&lines, *index, "setup question"));
    let Some(first_question) = first_question else {
        return Err("No `Setup Question =` records found. Import a text setup-script export, not a raw NVRAM dump or firmware image.".into());
    };

    let identity = parse_identity(&lines[..first_question]);
    let mut raw_entries: Vec<RawEntry> = Vec::new();
    let mut block_start = first_question;
    for index in (first_question + 1)..lines.len() {
        if is_field_at(&lines, index, "setup question") {
            raw_entries.push(parse_entry(&lines[block_start..index]));
            if raw_entries.len() >= MAX_SETTINGS {
                return Err("SCEWIN export contains more than 30,000 setup records; refusing an unexpectedly large or malformed file.".into());
            }
            block_start = index;
        }
    }
    raw_entries.push(parse_entry(&lines[block_start..]));
    if raw_entries.len() > MAX_SETTINGS {
        return Err("SCEWIN export contains more than 30,000 setup records; refusing an unexpectedly large or malformed file.".into());
    }

    let mut seen: HashMap<String, usize> = HashMap::new();
    let mut omitted_sensitive_entries = 0;
    let mut entries = Vec::with_capacity(raw_entries.len());

    for raw in raw_entries {
        if looks_sensitive(&raw.question) {
            omitted_sensitive_entries += 1;
            continue;
        }
        let question = display_text(&raw.question, MAX_LABEL_CHARS);
        if question.is_empty() {
            continue;
        }

        let base_key = comparison_key(&question, raw.token.as_deref(), raw.offset.as_deref());
        let occurrence = seen.entry(base_key.clone()).or_insert(0);
        *occurrence += 1;
        let key = if *occurrence == 1 {
            base_key
        } else {
            format!("{base_key}#{}", *occurrence)
        };

        entries.push(ScewinEntry {
            comparison_key: key,
            question,
            current_value: raw
                .current_value
                .map(|value| display_text(&value, MAX_VALUE_CHARS))
                .filter(|value| !value.is_empty()),
            default_value: raw
                .default_value
                .map(|value| display_text(&value, MAX_VALUE_CHARS))
                .filter(|value| !value.is_empty()),
            current_value_source: raw.current_value_source,
        });
    }

    Ok(ScewinDump {
        entries,
        omitted_sensitive_entries,
        identity,
    })
}

fn parse_entry(lines: &[&str]) -> RawEntry {
    let question = field_values(lines, "setup question")
        .into_iter()
        .next()
        .unwrap_or_default();
    let token = unique_field(lines, "token", normalize_code);
    let offset = unique_field(lines, "offset", normalize_code);
    let default_value = unique_field(lines, "bios default", clean_value);
    let (explicit_values, explicit_conflict) = distinct_field_values(lines, "value", clean_value);
    let selected_values = selected_option_values(lines);

    let (current_value, current_value_source) = match (
        selected_values.as_slice(),
        explicit_values.as_slice(),
        explicit_conflict,
    ) {
        ([selected], [explicit], false)
            if values_equivalent(&selected.label, explicit)
                || code_values_equivalent(&selected.code, explicit) =>
        {
            (Some(selected.label.clone()), "selected-option".to_string())
        }
        ([selected], [], false) => (Some(selected.label.clone()), "selected-option".to_string()),
        ([], [explicit], false) => (Some(explicit.clone()), "value-field".to_string()),
        ([], [], false) => (None, "not-reported".to_string()),
        _ => (None, "not-reported".to_string()),
    };

    let current_value_source = if explicit_conflict
        || selected_values.len() > 1
        || (!selected_values.is_empty()
            && !explicit_values.is_empty()
            && !values_equivalent(&selected_values[0].label, &explicit_values[0])
            && !code_values_equivalent(&selected_values[0].code, &explicit_values[0]))
    {
        "conflict".to_string()
    } else {
        current_value_source
    };

    RawEntry {
        question,
        token,
        offset,
        current_value,
        default_value,
        current_value_source,
    }
}

fn parse_identity(header: &[&str]) -> Option<ScewinIdentity> {
    let mut identity = ScewinIdentity {
        board_manufacturer: None,
        board_product: None,
        board_revision: None,
        bios_version: None,
    };

    for line in header {
        let candidate = line
            .trim()
            .trim_start_matches("//")
            .trim_start_matches('#')
            .trim_start_matches(';')
            .trim();
        let Some((key, value)) = candidate.split_once('=') else {
            continue;
        };
        let key = key.trim().to_ascii_lowercase();
        let value = clean_header_value(value);
        if value.is_empty() {
            continue;
        }
        let target = match key.as_str() {
            "board manufacturer" | "motherboard manufacturer" | "baseboard manufacturer" => {
                &mut identity.board_manufacturer
            }
            "board product" | "board model" | "motherboard model" | "baseboard product" => {
                &mut identity.board_product
            }
            "board revision" | "motherboard revision" | "baseboard revision" => {
                &mut identity.board_revision
            }
            "bios version" | "bios firmware version" | "firmware version" => {
                &mut identity.bios_version
            }
            _ => continue,
        };
        *target = Some(display_text(&value, MAX_LABEL_CHARS));
    }

    if identity.board_manufacturer.is_none()
        && identity.board_product.is_none()
        && identity.board_revision.is_none()
        && identity.bios_version.is_none()
    {
        None
    } else {
        Some(identity)
    }
}

/// Reads both `Name = Value` and SCEWIN's wrapped `Name` / `= Value` form.
fn field_at<'a>(lines: &'a [&'a str], index: usize) -> Option<(&'a str, &'a str, usize)> {
    let line = lines.get(index)?.trim();
    if line.is_empty() || line.starts_with("//") || line.starts_with('#') || line.starts_with(';') {
        return None;
    }
    if let Some((name, value)) = line.split_once('=') {
        let name = name.trim();
        return (!name.is_empty()).then_some((name, value.trim(), 1));
    }
    let next = lines.get(index + 1)?.trim();
    next.strip_prefix('=').map(|value| (line, value.trim(), 2))
}

fn is_field_at(lines: &[&str], index: usize, expected: &str) -> bool {
    field_at(lines, index)
        .map(|(name, _, _)| name.eq_ignore_ascii_case(expected))
        .unwrap_or(false)
}

fn field_values(lines: &[&str], expected: &str) -> Vec<String> {
    let mut values = Vec::new();
    let mut index = 0;
    while index < lines.len() {
        if let Some((name, value, consumed)) = field_at(lines, index) {
            if name.eq_ignore_ascii_case(expected) {
                values.push(value.to_string());
            }
            index += consumed;
        } else {
            index += 1;
        }
    }
    values
}

fn distinct_field_values(
    lines: &[&str],
    expected: &str,
    clean: fn(&str) -> String,
) -> (Vec<String>, bool) {
    let values = field_values(lines, expected)
        .iter()
        .map(|value| clean(value))
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();
    let distinct = distinct_values(values);
    let conflict = distinct.len() > 1;
    (distinct, conflict)
}

fn unique_field(lines: &[&str], expected: &str, clean: fn(&str) -> String) -> Option<String> {
    let (values, conflict) = distinct_field_values(lines, expected, clean);
    (!conflict).then(|| values.into_iter().next()).flatten()
}

fn distinct_values(values: Vec<String>) -> Vec<String> {
    let mut distinct: Vec<String> = Vec::new();
    for value in values {
        if !distinct
            .iter()
            .any(|existing| values_equivalent(existing, &value))
        {
            distinct.push(value);
        }
    }
    distinct
}

fn selected_option_values(lines: &[&str]) -> Vec<SelectedOption> {
    let mut inside_options = false;
    let mut selected = Vec::new();
    let mut index = 0;
    while index < lines.len() {
        if let Some((name, value, consumed)) = field_at(lines, index) {
            if name.eq_ignore_ascii_case("options") {
                inside_options = true;
                selected.extend(parse_options(value).into_iter().filter_map(
                    |(is_selected, code, label)| {
                        is_selected.then_some(SelectedOption { code, label })
                    },
                ));
            } else {
                inside_options = false;
            }
            index += consumed;
            continue;
        }
        if inside_options {
            selected.extend(parse_options(lines[index]).into_iter().filter_map(
                |(is_selected, code, label)| is_selected.then_some(SelectedOption { code, label }),
            ));
        }
        index += 1;
    }
    selected
}

fn parse_options(line: &str) -> Vec<(bool, String, String)> {
    let line = strip_comment(line);
    let bytes = line.as_bytes();
    let mut found = Vec::new();
    let mut cursor = 0;
    while cursor < bytes.len() {
        let Some(relative_open) = line[cursor..].find('[') else {
            break;
        };
        let open = cursor + relative_open;
        let Some(relative_close) = line[open + 1..].find(']') else {
            break;
        };
        let close = open + 1 + relative_close;
        let selected = line[..open].trim_end().ends_with('*');
        let next_open = line[close + 1..]
            .find('[')
            .map(|relative| close + 1 + relative)
            .unwrap_or(line.len());
        let label = line[close + 1..next_open].trim();
        let code = line[open + 1..close].trim();
        let code = clean_value(code);
        let label = clean_value(if label.is_empty() {
            code.as_str()
        } else {
            label
        });
        if !code.is_empty() || !label.is_empty() {
            found.push((selected, code, label));
        }
        cursor = close + 1;
    }
    found
}

fn clean_value(value: &str) -> String {
    let value = strip_comment(value).trim();
    let value = if value.starts_with('<') && value.ends_with('>') && value.len() >= 2 {
        &value[1..value.len() - 1]
    } else if value.starts_with('[') {
        if let Some(end) = value.find(']') {
            let label = value[end + 1..].trim();
            if label.is_empty() {
                &value[1..end]
            } else {
                label
            }
        } else {
            value
        }
    } else {
        value
    };
    value
        .trim_matches('"')
        .trim_matches('\'')
        .trim()
        .to_string()
}

fn clean_header_value(value: &str) -> String {
    strip_comment(value)
        .trim()
        .trim_matches('"')
        .trim_matches('\'')
        .trim()
        .to_string()
}

fn normalize_code(value: &str) -> String {
    display_text(
        value
            .trim()
            .split_whitespace()
            .next()
            .unwrap_or_default()
            .trim_matches('"')
            .trim_matches('\''),
        64,
    )
    .to_ascii_lowercase()
}

fn strip_comment(value: &str) -> &str {
    value.split("//").next().unwrap_or(value).trim()
}

fn comparison_key(question: &str, token: Option<&str>, offset: Option<&str>) -> String {
    let normalized_question: String = question
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect();
    format!(
        "{}:{}:{normalized_question}",
        token.unwrap_or("?"),
        offset.unwrap_or("?")
    )
}

fn values_equivalent(left: &str, right: &str) -> bool {
    left.trim().eq_ignore_ascii_case(right.trim())
}

fn code_values_equivalent(left: &str, right: &str) -> bool {
    if values_equivalent(left, right) {
        return true;
    }
    let parse_hex = |value: &str| {
        let value = value
            .trim()
            .trim_start_matches("0x")
            .trim_start_matches("0X");
        (!value.is_empty() && value.chars().all(|ch| ch.is_ascii_hexdigit()))
            .then(|| u64::from_str_radix(value, 16).ok())
            .flatten()
    };
    matches!((parse_hex(left), parse_hex(right)), (Some(a), Some(b)) if a == b)
}

fn looks_sensitive(question: &str) -> bool {
    let value = question.to_ascii_lowercase();
    [
        "password",
        "passcode",
        "serial",
        "uuid",
        "asset tag",
        "asset id",
        "asset",
        "mac address",
        "mac addr",
        "service tag",
        "device id",
        "product key",
        "license key",
        "security key",
        "recovery key",
        "system id",
        "unique id",
        "unique identifier",
    ]
    .iter()
    .any(|marker| value.contains(marker))
}

fn display_text(value: &str, max_chars: usize) -> String {
    value
        .chars()
        .filter(|ch| !ch.is_control())
        .take(max_chars)
        .collect::<String>()
        .trim()
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    const OPTIONS_DUMP: &str = "// Board Manufacturer = TestCo\n// Board Product = X670 Test\n// BIOS Version = 1234\nSetup Question = EXPO Profile\nToken = A2B // Do NOT change this line\nOffset = 0F\nWidth = 01\nBIOS Default = [00] Disabled\nOptions = [00] Disabled\n*[01] Profile 1\nSetup Question = CPU Thermal Limit\nToken = F00\nOffset = 20\nWidth = 01\nBIOS Default = <95>\nValue = <95>\n";

    #[test]
    fn reads_selected_option_and_optional_identity_header() {
        let dump = parse_scewin_dump(OPTIONS_DUMP).unwrap();
        assert_eq!(dump.entries.len(), 2);
        assert_eq!(dump.entries[0].question, "EXPO Profile");
        assert_eq!(dump.entries[0].current_value.as_deref(), Some("Profile 1"));
        assert_eq!(dump.entries[0].default_value.as_deref(), Some("Disabled"));
        assert_eq!(dump.entries[0].current_value_source, "selected-option");
        let identity = dump.identity.unwrap();
        assert_eq!(identity.board_product.as_deref(), Some("X670 Test"));
        assert_eq!(identity.bios_version.as_deref(), Some("1234"));
    }

    #[test]
    fn reads_wrapped_ami_fields_and_matches_numeric_value_to_selected_label() {
        let text = "// Board Manufacturer = TestCo\n// Board Product = X670 Test\n// Board Revision = 1.0\n// BIOS Version = 1234\nSetup Question\n= System Language\nToken =00 // Do NOT change this line\nOffset\n=00\nWidth =02\nBIOS Default\n= [0] N/A\nOptions\n= *[00] English\n[01] French\nSetup Question = PCI Latency Timer\nToken =00\nOffset =03\nBIOS Default\n= [20]32 PCI Bus Clocks\nOptions\n=*[20]32 PCI Bus Clocks // Move * to desired option\n[40]64 PCI Bus Clocks\nSetup Question = Profile\nValue = <01>\nOptions\n= *[01] Profile 1\n[02] Profile 2\n";
        let dump = parse_scewin_dump(text).unwrap();
        assert_eq!(dump.entries.len(), 3);
        assert_eq!(dump.entries[0].question, "System Language");
        assert_eq!(dump.entries[0].current_value.as_deref(), Some("English"));
        assert_eq!(dump.entries[0].default_value.as_deref(), Some("N/A"));
        assert_eq!(
            dump.entries[1].current_value.as_deref(),
            Some("32 PCI Bus Clocks")
        );
        assert_eq!(dump.entries[2].current_value.as_deref(), Some("Profile 1"));
        assert_eq!(dump.entries[2].current_value_source, "selected-option");
        assert_eq!(
            dump.identity.as_ref().unwrap().board_revision.as_deref(),
            Some("1.0")
        );
    }

    #[test]
    fn reads_scalar_value_and_keeps_missing_value_unknown() {
        let text = "Setup Question = Thermal Limit\nToken = 1\nOffset = 2\nBIOS Default = <90>\nValue = <71>\nSetup Question = Hidden Option\nToken = 3\nOffset = 4\nOptions = [00]Off\n[01]On\n";
        let dump = parse_scewin_dump(text).unwrap();
        assert_eq!(dump.entries[0].current_value.as_deref(), Some("71"));
        assert_eq!(dump.entries[0].current_value_source, "value-field");
        assert_eq!(dump.entries[1].current_value, None);
        assert_eq!(dump.entries[1].current_value_source, "not-reported");
    }

    #[test]
    fn conflicting_selected_and_value_fields_are_unknown() {
        let text = "Setup Question = Option\nValue = <00>\nOptions = *[01]Enabled\n[00]Disabled\n";
        let dump = parse_scewin_dump(text).unwrap();
        assert_eq!(dump.entries[0].current_value, None);
        assert_eq!(dump.entries[0].current_value_source, "conflict");
    }

    #[test]
    fn conflicting_repeated_value_fields_are_unknown() {
        let text = "Setup Question = Option\nValue = <00>\nValue = <01>\n";
        let dump = parse_scewin_dump(text).unwrap();
        assert_eq!(dump.entries[0].current_value, None);
        assert_eq!(dump.entries[0].current_value_source, "conflict");
    }

    #[test]
    fn filters_sensitive_setting_names_from_returned_data() {
        let text = "Setup Question = System Serial Number\nValue = <ABCD>\nSetup Question = Secure Boot\nValue = <Enabled>\n";
        let dump = parse_scewin_dump(text).unwrap();
        assert_eq!(dump.omitted_sensitive_entries, 1);
        assert_eq!(dump.entries.len(), 1);
        assert_eq!(dump.entries[0].question, "Secure Boot");
    }

    #[test]
    fn rejects_non_setup_script_and_oversized_input() {
        assert!(parse_scewin_dump("not a SCEWIN setup script").is_err());
        assert!(parse_scewin_dump(&"x".repeat(MAX_DUMP_BYTES + 1)).is_err());
    }

    #[test]
    fn duplicate_records_receive_distinct_comparison_keys() {
        let text = "Setup Question = Same Question\nToken = 1\nOffset = 2\nValue = <1>\nSetup Question = Same Question\nToken = 1\nOffset = 2\nValue = <2>\n";
        let dump = parse_scewin_dump(text).unwrap();
        assert_ne!(
            dump.entries[0].comparison_key,
            dump.entries[1].comparison_key
        );
    }
}
