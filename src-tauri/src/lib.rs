use serde::{Deserialize, Serialize};

#[tauri::command]
fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[derive(Serialize, Deserialize)]
pub struct HttpResponse {
    pub status: u16,
    pub body: String,
}

/// http_post carries Authorization headers, so it is restricted to the hosts
/// the app actually talks to: local inference servers and OpenRouter.
fn post_host_allowed(url: &str) -> bool {
    match reqwest::Url::parse(url) {
        Ok(u) => {
            if u.scheme() != "http" && u.scheme() != "https" {
                return false;
            }
            match u.host_str() {
                Some(h) => {
                    h == "127.0.0.1"
                        || h == "localhost"
                        || h == "::1"
                        || h == "[::1]"
                        || h == "openrouter.ai"
                        || h.ends_with(".openrouter.ai")
                }
                None => false,
            }
        }
        Err(_) => false,
    }
}

#[tauri::command]
async fn http_post(url: String, body: String, api_key: Option<String>) -> Result<HttpResponse, String> {
    if !post_host_allowed(&url) {
        return Err(format!("http_post blocked: host not allowlisted ({})", url));
    }
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;

    let mut req = client
        .post(&url)
        .header("Content-Type", "application/json");

    if let Some(key) = api_key {
        if !key.is_empty() {
            req = req.header("Authorization", format!("Bearer {}", key));
        }
    }

    let response = req.body(body).send().await.map_err(|e| e.to_string())?;
    let status = response.status().as_u16();
    let body = response.text().await.map_err(|e| e.to_string())?;

    Ok(HttpResponse { status, body })
}

fn cancelled_streams() -> &'static std::sync::Mutex<std::collections::HashSet<String>> {
    static S: std::sync::OnceLock<std::sync::Mutex<std::collections::HashSet<String>>> =
        std::sync::OnceLock::new();
    S.get_or_init(|| std::sync::Mutex::new(std::collections::HashSet::new()))
}

#[tauri::command]
fn cancel_stream(request_id: String) {
    cancelled_streams().lock().unwrap().insert(request_id);
}

/// Streams a chat-completions response, emitting `ai-stream-chunk` events as
/// bytes arrive. Same host allowlist as http_post. Returns the HTTP status.
/// Dropping the response on cancel closes the upstream connection, which stops
/// local inference servers from generating further.
#[tauri::command]
async fn http_post_stream(
    window: tauri::Window,
    url: String,
    body: String,
    api_key: Option<String>,
    request_id: String,
) -> Result<u16, String> {
    use futures_util::StreamExt;
    use tauri::Emitter;

    if !post_host_allowed(&url) {
        return Err(format!("http_post_stream blocked: host not allowlisted ({})", url));
    }

    // No total timeout — streams can be long-lived. Connect timeout only.
    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let mut req = client.post(&url).header("Content-Type", "application/json");
    if let Some(key) = api_key {
        if !key.is_empty() {
            req = req.header("Authorization", format!("Bearer {}", key));
        }
    }

    let response = req.body(body).send().await.map_err(|e| e.to_string())?;
    let status = response.status().as_u16();
    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        if cancelled_streams().lock().unwrap().remove(&request_id) {
            break;
        }
        let chunk = match chunk {
            Ok(c) => c,
            Err(e) => {
                let _ = window.emit(
                    "ai-stream-chunk",
                    serde_json::json!({ "id": request_id, "data": format!("\nstream error: {}", e) }),
                );
                break;
            }
        };
        let _ = window.emit(
            "ai-stream-chunk",
            serde_json::json!({ "id": request_id, "data": String::from_utf8_lossy(&chunk) }),
        );
    }
    cancelled_streams().lock().unwrap().remove(&request_id);
    Ok(status)
}

#[tauri::command]
async fn http_get(url: String) -> Result<HttpResponse, String> {
    // Arbitrary hosts are by design (RSS feeds, finance APIs), but only http(s).
    let scheme_ok = reqwest::Url::parse(&url)
        .map(|u| u.scheme() == "http" || u.scheme() == "https")
        .unwrap_or(false);
    if !scheme_ok {
        return Err(format!("http_get blocked: invalid or non-http URL ({})", url));
    }
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36")
        .build()
        .map_err(|e| e.to_string())?;

    let response = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let status = response.status().as_u16();
    let body = response.text().await.map_err(|e| e.to_string())?;

    Ok(HttpResponse { status, body })
}

#[tauri::command]
async fn transcribe_audio(
    audio_b64: String,
    mime_type: String,
    api_key: String,
) -> Result<String, String> {
    use base64::Engine;
    let audio_bytes = base64::engine::general_purpose::STANDARD
        .decode(&audio_b64)
        .map_err(|e| e.to_string())?;

    let ext = if mime_type.contains("mp4") { "mp4" }
              else if mime_type.contains("ogg") { "ogg" }
              else { "webm" };

    let part = reqwest::multipart::Part::bytes(audio_bytes)
        .file_name(format!("recording.{}", ext))
        .mime_str(&mime_type)
        .map_err(|e| e.to_string())?;

    let form = reqwest::multipart::Form::new()
        .part("file", part)
        .text("model", "google/chirp-3");

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .post("https://openrouter.ai/api/v1/audio/transcriptions")
        .header("Authorization", format!("Bearer {}", api_key))
        .multipart(form)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = response.status().as_u16();
    let body = response.text().await.map_err(|e| e.to_string())?;

    if status != 200 {
        return Err(format!("STT {}: {}", status, body));
    }

    let json: serde_json::Value = serde_json::from_str(&body).map_err(|e| e.to_string())?;
    Ok(json["text"].as_str().unwrap_or("").to_string())
}

#[tauri::command]
async fn synthesize_speech(text: String, voice: String) -> Result<String, String> {
    use base64::Engine;
    let output_path = std::env::temp_dir().join("ms_tts.aiff");
    let output_str = output_path.to_str().ok_or("invalid temp path")?;

    let status = std::process::Command::new("say")
        .args(["-v", &voice, "-o", output_str, "--", &text])
        .status()
        .map_err(|e| e.to_string())?;

    if !status.success() {
        return Err(format!("say exited with: {}", status));
    }

    let bytes = std::fs::read(&output_path).map_err(|e| e.to_string())?;
    Ok(base64::engine::general_purpose::STANDARD.encode(&bytes))
}

/// Creates the backups directory, prunes old snapshots (keeps the 9 newest so
/// the incoming backup makes 10), and returns the path for a new backup file.
/// The frontend then runs `VACUUM INTO` against this path for a consistent
/// snapshot even with the connection open.
#[tauri::command]
fn prepare_backup_path(app: tauri::AppHandle) -> Result<String, String> {
    use tauri::Manager;
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("backups");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let mut backups: Vec<_> = std::fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .filter(|e| {
            let n = e.file_name().to_string_lossy().to_string();
            n.starts_with("mindspace-") && n.ends_with(".db")
        })
        .collect();
    backups.sort_by_key(|e| e.file_name());
    while backups.len() > 9 {
        let oldest = backups.remove(0);
        let _ = std::fs::remove_file(oldest.path());
    }

    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs();
    let path = dir.join(format!("mindspace-{}.db", ts));
    path.to_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "invalid backup path".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            #[cfg(desktop)]
            {
                use tauri::{
                    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
                    Manager,
                };
                TrayIconBuilder::with_id("mindspace-tray")
                    .icon(app.default_window_icon().expect("app icon").clone())
                    .icon_as_template(true)
                    .tooltip("MindSpace capture")
                    .on_tray_icon_event(|tray, event| {
                        let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            position,
                            ..
                        } = event
                        else {
                            return;
                        };
                        let app = tray.app_handle();
                        let Some(win) = app.get_webview_window("capture") else {
                            return;
                        };
                        if win.is_visible().unwrap_or(false) {
                            let _ = win.hide();
                            return;
                        }
                        // Center the popover under the tray icon click.
                        let width = win
                            .outer_size()
                            .map(|s| s.width as i32)
                            .unwrap_or(520);
                        let x = (position.x as i32 - width / 2).max(0);
                        let y = position.y as i32 + 8;
                        let _ = win.set_position(tauri::Position::Physical(
                            tauri::PhysicalPosition::new(x, y),
                        ));
                        let _ = win.show();
                        let _ = win.set_focus();
                    })
                    .build(app)?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_app_version, http_post, http_post_stream, cancel_stream, http_get, transcribe_audio, synthesize_speech, prepare_backup_path])
        .run(tauri::generate_context!())
        .expect("error while running MindSpace");
}
