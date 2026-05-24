use std::time::{Duration, Instant};

use hmac::{Hmac, KeyInit, Mac};
use sha2::Sha256;

use crate::{models::EmbedTemplate, queue, state::AppState};

pub struct WebhookVars {
    pub repo_name: String,
    pub repo_full_name: String,
    pub repo_url: String,
    pub pusher_name: String,
    pub pusher_avatar: String,
    pub branch: String,
    pub commit_count: usize,
    pub added_commits: String,
    pub modified_commits: String,
    pub removed_commits: String,
    pub all_commits: String,
    pub unix_timestamp: i64,
}

pub fn substitute(template: &str, vars: &WebhookVars) -> String {
    template
        .replace("{{repo_name}}", &vars.repo_name)
        .replace("{{repo_full_name}}", &vars.repo_full_name)
        .replace("{{repo_url}}", &vars.repo_url)
        .replace("{{pusher_name}}", &vars.pusher_name)
        .replace("{{pusher_avatar}}", &vars.pusher_avatar)
        .replace("{{branch}}", &vars.branch)
        .replace("{{commit_count}}", &vars.commit_count.to_string())
        .replace("{{added_commits}}", &vars.added_commits)
        .replace("{{modified_commits}}", &vars.modified_commits)
        .replace("{{removed_commits}}", &vars.removed_commits)
        .replace("{{all_commits}}", &vars.all_commits)
        .replace(
            "{{discord_timestamp_t}}",
            &format!("<t:{}:t>", vars.unix_timestamp),
        )
        .replace(
            "{{discord_timestamp_T}}",
            &format!("<t:{}:T>", vars.unix_timestamp),
        )
        .replace(
            "{{discord_timestamp_d}}",
            &format!("<t:{}:d>", vars.unix_timestamp),
        )
        .replace(
            "{{discord_timestamp_D}}",
            &format!("<t:{}:D>", vars.unix_timestamp),
        )
        .replace(
            "{{discord_timestamp_f}}",
            &format!("<t:{}:f>", vars.unix_timestamp),
        )
        .replace(
            "{{discord_timestamp_F}}",
            &format!("<t:{}:F>", vars.unix_timestamp),
        )
        .replace(
            "{{discord_timestamp_R}}",
            &format!("<t:{}:R>", vars.unix_timestamp),
        )
}

pub fn split_text(text: &str, max_len: usize) -> Vec<String> {
    if text.chars().count() <= max_len {
        return vec![text.to_string()];
    }
    let mut parts = Vec::new();
    let mut current = String::new();
    for line in text.lines() {
        if current.chars().count() + line.chars().count() + 1 > max_len && !current.is_empty() {
            parts.push(current.clone());
            current.clear();
        }
        if !current.is_empty() {
            current.push('\n');
        }
        current.push_str(line);
    }
    if !current.is_empty() {
        parts.push(current);
    }
    parts
}

pub fn verify_github_signature(secret: &str, body: &[u8], sig_header: &str) -> bool {
    let expected_hex = sig_header.strip_prefix("sha256=").unwrap_or("");
    let expected_bytes = match hex::decode(expected_hex) {
        Ok(b) => b,
        Err(_) => return false,
    };
    let mut mac = match Hmac::<Sha256>::new_from_slice(secret.as_bytes()) {
        Ok(m) => m,
        Err(_) => return false,
    };
    mac.update(body);
    mac.verify_slice(&expected_bytes).is_ok()
}

fn should_keep_commit(message: &str, filters: &[String]) -> bool {
    let msg_lower = message.to_lowercase();
    if msg_lower.contains("merge pull request") {
        return false;
    }
    for f in filters {
        if !f.is_empty() {
            if let Ok(re) = regex::Regex::new(&format!("(?i){}", regex::escape(f))) {
                if re.is_match(message) {
                    return false;
                }
            } else if msg_lower.contains(&f.to_lowercase()) {
                return false;
            }
        }
    }
    true
}

pub fn format_commits(
    commits: &[serde_json::Value],
    file_type: &str,
    filters: &[String],
) -> String {
    let mut lines = Vec::new();
    for commit in commits {
        let id = commit["id"].as_str().unwrap_or("");
        let short_id = &id[..id.len().min(7)];
        let msg = commit["message"]
            .as_str()
            .unwrap_or("")
            .lines()
            .next()
            .unwrap_or("");
        let url = commit["url"].as_str().unwrap_or("");
        let author = commit["author"]["name"].as_str().unwrap_or("");

        if !should_keep_commit(msg, filters) {
            continue;
        }

        let files: Vec<&str> = commit[file_type]
            .as_array()
            .map(|a| a.iter().filter_map(|v| v.as_str()).collect())
            .unwrap_or_default();

        if !files.is_empty() {
            lines.push(format!("[`{}`]({}) - {} - {}", short_id, url, msg, author));
        }
    }
    lines.join("\n")
}

pub fn build_all_commits(commits: &[serde_json::Value], filters: &[String]) -> String {
    let mut lines = Vec::new();
    for commit in commits {
        let id = commit["id"].as_str().unwrap_or("");
        let short_id = &id[..id.len().min(7)];
        let msg = commit["message"]
            .as_str()
            .unwrap_or("")
            .lines()
            .next()
            .unwrap_or("");
        let url = commit["url"].as_str().unwrap_or("");
        let author = commit["author"]["name"].as_str().unwrap_or("");

        if !should_keep_commit(msg, filters) {
            continue;
        }

        lines.push(format!("[`{}`]({}) - {} - {}", short_id, url, msg, author));
    }
    lines.join("\n")
}

pub async fn send_to_discord(
    client: &reqwest::Client,
    webhook_url: &str,
    template: &EmbedTemplate,
    vars: &WebhookVars,
    timestamp: &str,
) -> anyhow::Result<()> {
    let description_raw = template
        .description
        .as_deref()
        .map(|d| substitute(d, vars))
        .unwrap_or_default();

    let parts = split_text(&description_raw, 3900);
    for (i, part) in parts.iter().enumerate() {
        let embed = build_embed(template, vars, timestamp, &parts, i, part);
        let payload = serde_json::json!({ "embeds": [embed] });
        client
            .post(webhook_url)
            .json(&payload)
            .send()
            .await?
            .error_for_status()?;
    }
    Ok(())
}

pub async fn send_to_discord_with_state(
    state: &std::sync::Arc<AppState>,
    client: &reqwest::Client,
    webhook_url: &str,
    template: &EmbedTemplate,
    vars: &WebhookVars,
    timestamp: &str,
    repository_id: Option<&str>,
) -> anyhow::Result<()> {
    let maybe_sleep: Option<Duration> = {
        let mut limiter = state.discord_rate.lock().unwrap();
        let entry = limiter
            .entry(webhook_url.to_string())
            .or_insert_with(|| Instant::now() - Duration::from_secs(1));
        let elapsed = entry.elapsed();
        if elapsed < Duration::from_millis(500) {
            let wait = Duration::from_millis(500) - elapsed;
            *entry = Instant::now() + wait;
            Some(wait)
        } else {
            *entry = Instant::now();
            None
        }
    };

    if let Some(wait) = maybe_sleep {
        tokio::time::sleep(wait).await;
    }

    let description_raw = template
        .description
        .as_deref()
        .map(|d| substitute(d, vars))
        .unwrap_or_default();
    let parts = split_text(&description_raw, 3900);

    for (i, part) in parts.iter().enumerate() {
        let embed = build_embed(template, vars, timestamp, &parts, i, part);
        let payload = serde_json::json!({ "embeds": [embed] });

        let resp = client.post(webhook_url).json(&payload).send().await?;
        let status = resp.status();

        if status.is_success() {
            continue;
        }

        let delay = if status.as_u16() == 429 {
            resp.headers()
                .get("retry-after")
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.parse::<i64>().ok())
                .unwrap_or(30)
        } else {
            30
        };

        let embed_json = serde_json::to_string(&payload).unwrap_or_default();
        queue::enqueue(&state.pool, repository_id, webhook_url, &embed_json, delay).await;

        return Err(anyhow::anyhow!(
            "Discord returned {}, queued for retry",
            status
        ));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dummy_vars() -> WebhookVars {
        WebhookVars {
            repo_name: "my-repo".into(),
            repo_full_name: "org/my-repo".into(),
            repo_url: "https://github.com/org/my-repo".into(),
            pusher_name: "alice".into(),
            pusher_avatar: "https://example.com/avatar.png".into(),
            branch: "main".into(),
            commit_count: 3,
            added_commits: "add A\nadd B".into(),
            modified_commits: "mod C".into(),
            removed_commits: String::new(),
            all_commits: "add A\nadd B\nmod C".into(),
            unix_timestamp: 1_700_000_000,
        }
    }

    #[test]
    fn substitute_basic_vars() {
        let vars = dummy_vars();
        let result = substitute("{{repo_name}} pushed to {{branch}}", &vars);
        assert_eq!(result, "my-repo pushed to main");
    }

    #[test]
    fn substitute_all_vars_replaced() {
        let vars = dummy_vars();
        let template = "{{repo_name}} {{repo_full_name}} {{repo_url}} {{pusher_name}} \
                        {{pusher_avatar}} {{branch}} {{commit_count}} \
                        {{added_commits}} {{modified_commits}} {{removed_commits}} {{all_commits}}";
        let result = substitute(template, &vars);
        assert!(!result.contains("{{"));
        assert!(!result.contains("}}"));
    }

    #[test]
    fn substitute_discord_timestamps() {
        let vars = dummy_vars();
        let result = substitute("{{discord_timestamp_R}}", &vars);
        assert_eq!(result, "<t:1700000000:R>");
    }

    #[test]
    fn substitute_no_match_unchanged() {
        let vars = dummy_vars();
        let result = substitute("no variables here", &vars);
        assert_eq!(result, "no variables here");
    }

    #[test]
    fn valid_signature_passes() {
        use hmac::{Hmac, KeyInit, Mac};
        use sha2::Sha256;

        let secret = "mysecret";
        let body = b"hello world";
        let mut mac = Hmac::<Sha256>::new_from_slice(secret.as_bytes()).unwrap();
        mac.update(body);
        let sig = format!("sha256={}", hex::encode(mac.finalize().into_bytes()));

        assert!(verify_github_signature(secret, body, &sig));
    }

    #[test]
    fn wrong_secret_fails() {
        use hmac::{Hmac, KeyInit, Mac};
        use sha2::Sha256;

        let body = b"hello world";
        let mut mac = Hmac::<Sha256>::new_from_slice(b"correct").unwrap();
        mac.update(body);
        let sig = format!("sha256={}", hex::encode(mac.finalize().into_bytes()));

        assert!(!verify_github_signature("wrong", body, &sig));
    }

    #[test]
    fn tampered_body_fails() {
        use hmac::{Hmac, KeyInit, Mac};
        use sha2::Sha256;

        let secret = "mysecret";
        let mut mac = Hmac::<Sha256>::new_from_slice(secret.as_bytes()).unwrap();
        mac.update(b"original body");
        let sig = format!("sha256={}", hex::encode(mac.finalize().into_bytes()));

        assert!(!verify_github_signature(secret, b"tampered body", &sig));
    }

    #[test]
    fn empty_signature_fails() {
        assert!(!verify_github_signature("secret", b"body", ""));
        assert!(!verify_github_signature("secret", b"body", "sha256="));
    }

    #[test]
    fn split_text_short_returns_single() {
        let parts = split_text("hello", 100);
        assert_eq!(parts.len(), 1);
        assert_eq!(parts[0], "hello");
    }

    #[test]
    fn split_text_long_splits_correctly() {
        let line = "a".repeat(50);
        let text = format!("{}\n{}\n{}", line, line, line); // 152 chars
        let parts = split_text(&text, 100);
        assert!(parts.len() > 1);
        for p in &parts {
            assert!(p.chars().count() <= 100);
        }
    }

    #[test]
    fn split_text_preserves_content() {
        let text = "line one\nline two\nline three";
        let parts = split_text(text, 15);
        let rejoined = parts.join("\n");
        assert!(rejoined.contains("line one"));
        assert!(rejoined.contains("line two"));
        assert!(rejoined.contains("line three"));
    }

    #[test]
    fn merge_commits_always_filtered() {
        let filters: Vec<String> = vec![];
        let commit = serde_json::json!({
            "id": "abc1234",
            "message": "Merge pull request #42 from branch",
            "url": "https://example.com",
            "author": { "name": "bot" },
            "added": ["file.rs"],
            "modified": [],
            "removed": [],
        });
        let result = format_commits(&[commit], "added", &filters);
        assert!(result.is_empty(), "merge commits should be filtered");
    }

    #[test]
    fn keyword_filter_removes_matching_commits() {
        let filters = vec!["[skip]".to_string()];
        let commit = serde_json::json!({
            "id": "abc1234",
            "message": "fix typo [skip]",
            "url": "https://example.com",
            "author": { "name": "alice" },
            "added": ["readme.md"],
            "modified": [],
            "removed": [],
        });
        let result = format_commits(&[commit], "added", &filters);
        assert!(
            result.is_empty(),
            "commit matching keyword filter should be removed"
        );
    }

    #[test]
    fn normal_commit_passes_filter() {
        let filters = vec!["[skip]".to_string()];
        let commit = serde_json::json!({
            "id": "abc1234567",
            "message": "feat: add cool feature",
            "url": "https://example.com/commit/abc",
            "author": { "name": "alice" },
            "added": ["src/main.rs"],
            "modified": [],
            "removed": [],
        });
        let result = format_commits(&[commit], "added", &filters);
        assert!(!result.is_empty(), "normal commit should pass through");
        assert!(result.contains("abc1234"));
        assert!(result.contains("feat: add cool feature"));
    }
}

fn build_embed(
    template: &EmbedTemplate,
    vars: &WebhookVars,
    timestamp: &str,
    parts: &[String],
    i: usize,
    part: &str,
) -> serde_json::Value {
    let mut embed = serde_json::json!({
        "description": part,
        "color": template.color.unwrap_or(1752220),
    });
    if i == 0 {
        if let Some(ref t) = template.title {
            embed["title"] = serde_json::Value::String(substitute(t, vars));
        }
        if let Some(ref u) = template.url {
            embed["url"] = serde_json::Value::String(substitute(u, vars));
        }
        if let Some(ref n) = template.author_name {
            let mut author = serde_json::json!({ "name": substitute(n, vars) });
            if let Some(ref au) = template.author_url {
                author["url"] = serde_json::Value::String(substitute(au, vars));
            }
            if let Some(ref ai) = template.author_icon_url {
                author["icon_url"] = serde_json::Value::String(substitute(ai, vars));
            }
            embed["author"] = author;
        }
        if let Some(ref th) = template.thumbnail_url {
            embed["thumbnail"] = serde_json::json!({ "url": substitute(th, vars) });
        }
    }
    if i == parts.len() - 1 {
        if template.use_timestamp.unwrap_or(false) {
            embed["timestamp"] = serde_json::Value::String(timestamp.to_string());
        }
        if let Some(ref ft) = template.footer_text {
            let mut footer = serde_json::json!({ "text": substitute(ft, vars) });
            if let Some(ref fi) = template.footer_icon_url {
                footer["icon_url"] = serde_json::Value::String(substitute(fi, vars));
            }
            embed["footer"] = footer;
        }
        if let Some(ref img) = template.image_url {
            embed["image"] = serde_json::json!({ "url": substitute(img, vars) });
        }
    }
    embed
}
