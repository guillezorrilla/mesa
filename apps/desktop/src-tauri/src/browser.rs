use serde::Serialize;
use std::io::{Read, Write};
use std::os::unix::{fs::PermissionsExt, net::UnixListener};
use std::sync::mpsc;
use std::time::Duration;
use tauri::{
    webview::PageLoadEvent, AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Rect, Url,
    Webview, WebviewBuilder, WebviewUrl,
};

#[derive(Clone, Serialize)]
struct BrowserLoad {
    session: String,
    url: String,
}

#[tauri::command]
pub fn browser_owner_pid() -> u32 {
    std::process::id()
}

/// Local CLI calls use the same live DOM check as the desktop send button.
pub fn serve_selection(app: &AppHandle) -> std::io::Result<()> {
    let path = std::env::temp_dir().join(format!("mesa-browser-{}.sock", std::process::id()));
    if path.exists() {
        std::fs::remove_file(&path)?;
    }
    let listener = UnixListener::bind(&path)?;
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600))?;
    let app = app.clone();
    std::thread::spawn(move || {
        for incoming in listener.incoming() {
            let Ok(mut stream) = incoming else { continue };
            let _ = stream.set_read_timeout(Some(Duration::from_secs(3)));
            let _ = stream.set_write_timeout(Some(Duration::from_secs(3)));
            let mut request = Vec::new();
            let result = Read::take(&mut stream, 64)
                .read_to_end(&mut request)
                .ok()
                .and_then(|_| serde_json::from_slice::<String>(&request).ok())
                .and_then(|session| {
                    tauri::async_runtime::block_on(browser_pick_result(app.clone(), session)).ok()
                })
                .flatten();
            let _ = stream.write_all(
                serde_json::to_string(&result)
                    .unwrap_or_else(|_| "null".into())
                    .as_bytes(),
            );
        }
    });
    Ok(())
}

fn label(session: &str) -> Result<String, String> {
    if session.len() != 8
        || !session
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit())
    {
        return Err("invalid Mesa session id".into());
    }
    Ok(format!("browser-{session}"))
}

fn address(input: &str) -> Result<Url, String> {
    let url = Url::parse(input).map_err(|_| "enter a complete http or https URL")?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("browser URLs must be http or https without credentials".into());
    }
    Ok(url)
}

fn bounds(x: f64, y: f64, width: f64, height: f64) -> Result<Rect, String> {
    if ![x, y, width, height].iter().all(|value| value.is_finite())
        || x < 0.0
        || y < 0.0
        || width < 100.0
        || height < 100.0
    {
        return Err("browser bounds are invalid".into());
    }
    Ok(Rect {
        position: LogicalPosition::new(x, y).into(),
        size: LogicalSize::new(width, height).into(),
    })
}

fn bounded(text: &str, bytes: usize) -> String {
    let mut out = String::new();
    for character in text.chars() {
        if out.len() + character.len_utf8() > bytes {
            break;
        }
        out.push(character);
    }
    out
}

/// A remote child webview has no Mesa capability; navigation is limited to web URLs.
#[tauri::command]
pub fn browser_open(
    app: AppHandle,
    session: String,
    url: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<String, String> {
    let label = label(&session)?;
    let url = address(&url)?;
    let rect = bounds(x, y, width, height)?;
    if let Some(view) = app.get_webview(&label) {
        view.set_bounds(rect).map_err(|error| error.to_string())?;
        view.navigate(url).map_err(|error| error.to_string())?;
        return Ok(label);
    }
    let window = app.get_window("main").ok_or("main window is unavailable")?;
    let loaded_app = app.clone();
    let loaded_session = session.clone();
    let builder = WebviewBuilder::new(&label, WebviewUrl::External(url))
        .on_navigation(|url| {
            matches!(url.scheme(), "http" | "https")
                && url.host().is_some()
                && url.username().is_empty()
                && url.password().is_none()
        })
        .on_page_load(move |_view, payload| {
            if payload.event() == PageLoadEvent::Started {
                let _ = loaded_app.emit_to(
                    "main",
                    "browser://load",
                    BrowserLoad {
                        session: loaded_session.clone(),
                        url: payload.url().to_string(),
                    },
                );
            }
        });
    window
        .add_child(builder, rect.position, rect.size)
        .map_err(|error| error.to_string())?;
    Ok(label)
}

#[tauri::command]
pub fn browser_navigate(app: AppHandle, session: String, url: String) -> Result<(), String> {
    let view = app
        .get_webview(&label(&session)?)
        .ok_or("browser is closed")?;
    view.navigate(address(&url)?)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn browser_bounds(
    app: AppHandle,
    session: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let view = app
        .get_webview(&label(&session)?)
        .ok_or("browser is closed")?;
    view.set_bounds(bounds(x, y, width, height)?)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn browser_close(app: AppHandle, session: String) -> Result<(), String> {
    if let Some(view) = app.get_webview(&label(&session)?) {
        view.close().map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn browser_back(app: AppHandle, session: String) -> Result<(), String> {
    let view = app
        .get_webview(&label(&session)?)
        .ok_or("browser is closed")?;
    view.eval("history.back()")
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn browser_forward(app: AppHandle, session: String) -> Result<(), String> {
    let view = app
        .get_webview(&label(&session)?)
        .ok_or("browser is closed")?;
    view.eval("history.forward()")
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn browser_reload(app: AppHandle, session: String) -> Result<(), String> {
    let view = app
        .get_webview(&label(&session)?)
        .ok_or("browser is closed")?;
    view.eval("location.reload()")
        .map_err(|error| error.to_string())
}

async fn evaluate(view: Webview, script: &'static str) -> Result<serde_json::Value, String> {
    let (sender, receiver) = mpsc::channel();
    view.eval_with_callback(script, move |value| {
        let _ = sender.send(value);
    })
    .map_err(|error| error.to_string())?;
    let raw =
        tauri::async_runtime::spawn_blocking(move || receiver.recv_timeout(Duration::from_secs(3)))
            .await
            .map_err(|error| error.to_string())?
            .map_err(|_| "browser page did not answer")?;
    if raw.len() > 8192 {
        return Err("browser page context is too large".into());
    }
    serde_json::from_str(&raw).map_err(|_| "browser page returned no DOM context".into())
}

/// Bounded DOM probe for the WKWebView spike; page content is returned as untrusted data.
#[tauri::command]
pub async fn browser_probe(app: AppHandle, session: String) -> Result<serde_json::Value, String> {
    let view = app
        .get_webview(&label(&session)?)
        .ok_or("browser is closed")?;
    let value = evaluate(view, "({url: location.href.slice(0, 2048), title: document.title.slice(0, 256), heading: (document.querySelector('h1')?.innerText ?? '').slice(0, 512)})").await?;
    Ok(serde_json::json!({
        "url": bounded(value.get("url").and_then(|value| value.as_str()).unwrap_or(""), 2048),
        "title": bounded(value.get("title").and_then(|value| value.as_str()).unwrap_or(""), 256),
        "heading": bounded(value.get("heading").and_then(|value| value.as_str()).unwrap_or(""), 512),
    }))
}

/// A person's next click is captured on the page; it never invokes a Mesa command.
#[tauri::command]
pub fn browser_pick_start(app: AppHandle, session: String) -> Result<(), String> {
    let view = app
        .get_webview(&label(&session)?)
        .ok_or("browser is closed")?;
    view.eval(r#"
        if (typeof window.__mesaPickListener === 'function')
          document.removeEventListener('click', window.__mesaPickListener, true);
        window.__mesaPickedElement = null;
        window.__mesaPickListener = function pick(event) {
          document.removeEventListener('click', pick, true);
          window.__mesaPickListener = null;
          event.preventDefault();
          event.stopImmediatePropagation();
          let element = event.target;
          if (!(element instanceof Element)) return;
          const parts = [];
          for (let depth = 0; element && depth < 6; depth++, element = element.parentElement) {
            let part = element.tagName.toLowerCase();
            if (element.id) {
              part += '#' + CSS.escape(element.id);
              parts.unshift(part);
              break;
            }
            const peers = element.parentElement
              ? [...element.parentElement.children].filter(child => child.tagName === element.tagName)
              : [];
            if (peers.length > 1) part += ':nth-of-type(' + (peers.indexOf(element) + 1) + ')';
            parts.unshift(part);
          }
          const chosen = event.target;
          const bound = (text, limit) => {
            let value = '';
            let bytes = 0;
            const encoder = new TextEncoder();
            for (const character of text) {
              bytes += encoder.encode(character).length;
              if (bytes > limit) break;
              value += character;
            }
            return value;
          };
          if (new TextEncoder().encode(location.href).length > 2048) return;
          const selector = bound(parts.join(' > '), 512);
          try { if (document.querySelector(selector) !== chosen) return; } catch { return; }
          window.__mesaPickedElement = {
            url: location.href,
            title: bound(document.title, 256),
            selector,
            text: bound((chosen.innerText || '').trim(), 1024)
          };
        };
        document.addEventListener('click', window.__mesaPickListener, true);
    "#).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn browser_pick_result(
    app: AppHandle,
    session: String,
) -> Result<Option<serde_json::Value>, String> {
    let view = app
        .get_webview(&label(&session)?)
        .ok_or("browser is closed")?;
    let value = evaluate(
        view,
        r#"(() => {
          const picked = window.__mesaPickedElement;
          const bound = (text, limit) => {
            let value = '';
            let bytes = 0;
            const encoder = new TextEncoder();
            for (const character of text) {
              bytes += encoder.encode(character).length;
              if (bytes > limit) break;
              value += character;
            }
            return value;
          };
          if (!picked || picked.url !== location.href || picked.title !== bound(document.title, 256)) return null;
          let element;
          try { element = document.querySelector(picked.selector); } catch { return null; }
          if (!element || bound((element.innerText || '').trim(), 1024) !== picked.text) return null;
          return picked;
        })()"#,
    )
    .await?;
    if value.is_null() {
        return Ok(None);
    }
    Ok(Some(serde_json::json!({
        "url": bounded(value.get("url").and_then(|value| value.as_str()).unwrap_or(""), 2048),
        "title": bounded(value.get("title").and_then(|value| value.as_str()).unwrap_or(""), 256),
        "selector": bounded(value.get("selector").and_then(|value| value.as_str()).unwrap_or(""), 512),
        "text": bounded(value.get("text").and_then(|value| value.as_str()).unwrap_or(""), 1024),
    })))
}
