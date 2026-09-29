use mac_usernotifications::{
    get_notification_settings, request_auth, AuthorizationStatus, Notification,
    NotificationSettingStatus,
};
use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager};

#[derive(Clone, Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Target {
    Session { id: String },
    Inbox,
    Doctor,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    authorization: &'static str,
    alerts_enabled: bool,
    sounds_enabled: bool,
}

#[tauri::command]
pub async fn notification_status() -> Result<Status, String> {
    let settings = get_notification_settings()
        .await
        .map_err(|e| e.to_string())?;
    let authorization = match settings.authorization_status {
        AuthorizationStatus::NotDetermined => "not-determined",
        AuthorizationStatus::Denied => "denied",
        AuthorizationStatus::Authorized => "authorized",
        AuthorizationStatus::Provisional => "provisional",
        AuthorizationStatus::Ephemeral => "ephemeral",
        AuthorizationStatus::Unknown => "unknown",
    };
    Ok(Status {
        authorization,
        alerts_enabled: settings.alert_enabled == NotificationSettingStatus::Enabled,
        sounds_enabled: settings.sound_enabled == NotificationSettingStatus::Enabled,
    })
}

#[tauri::command]
pub async fn notification_request_permission() -> Result<Status, String> {
    let granted = request_auth().await.map_err(|e| e.to_string())?;
    let status = notification_status().await?;
    if !granted && status.authorization == "not-determined" {
        return Err("macOS did not show a permission prompt. Open System Settings > Notifications > Mesa and turn on Allow Notifications".into());
    }
    Ok(status)
}

#[tauri::command]
pub async fn notification_send(
    app: tauri::AppHandle,
    id: String,
    title: String,
    body: String,
    sound: bool,
    target: Target,
) -> Result<(), String> {
    if id.len() > 100 || title.len() > 150 || body.len() > 300 {
        return Err("notification fields are too long".into());
    }
    if let Target::Session { id } = &target {
        if id.len() != 8
            || !id
                .bytes()
                .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit())
        {
            return Err("invalid session target".into());
        }
    }
    let status = notification_status().await?;
    if !matches!(
        status.authorization,
        "authorized" | "provisional" | "ephemeral"
    ) {
        return Err("notification permission is not granted".into());
    }
    let mut notification = Notification::new().id(&id).title(title).message(body);
    if sound {
        notification = notification.default_sound();
    }
    let handle = notification.send().await.map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn(async move {
        if let Ok(response) = handle.response().await {
            if response.is_default_action() {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
                let _ = app.emit("notification-open", target);
            }
        }
    });
    Ok(())
}
