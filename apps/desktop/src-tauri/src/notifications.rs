use std::sync::{Mutex, OnceLock};

use block2::DynBlock;
use mac_usernotifications::{
    get_notification_settings, request_auth, AuthorizationStatus, Notification,
    NotificationSettingStatus,
};
use objc2::{define_class, rc::Retained, AnyThread};
use objc2_foundation::{NSObject, NSObjectProtocol};
use objc2_user_notifications::{
    UNNotification, UNNotificationDefaultActionIdentifier, UNNotificationPresentationOptions,
    UNNotificationResponse, UNUserNotificationCenter, UNUserNotificationCenterDelegate,
};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

#[derive(Clone, Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Target {
    Session { id: String },
    Inbox,
    Doctor,
}

static APP: OnceLock<AppHandle> = OnceLock::new();
static OPENED: Mutex<Option<Target>> = Mutex::new(None);

define_class!(
    #[unsafe(super(NSObject))]
    #[name = "MesaNotificationDelegate"]
    struct MesaNotificationDelegate;

    unsafe impl NSObjectProtocol for MesaNotificationDelegate {}

    unsafe impl UNUserNotificationCenterDelegate for MesaNotificationDelegate {
        #[unsafe(method(userNotificationCenter:willPresentNotification:withCompletionHandler:))]
        fn will_present_notification(
            &self,
            _center: &UNUserNotificationCenter,
            _notification: &UNNotification,
            completion: &DynBlock<dyn Fn(UNNotificationPresentationOptions)>,
        ) {
            completion.call((UNNotificationPresentationOptions::Banner
                | UNNotificationPresentationOptions::Sound,));
        }

        #[unsafe(method(userNotificationCenter:didReceiveNotificationResponse:withCompletionHandler:))]
        fn did_receive_response(
            &self,
            _center: &UNUserNotificationCenter,
            response: &UNNotificationResponse,
            completion: &DynBlock<dyn Fn()>,
        ) {
            if response.actionIdentifier().to_string()
                == unsafe { UNNotificationDefaultActionIdentifier.to_string() }
            {
                let id = response.notification().request().identifier().to_string();
                if let (Some(app), Some(target)) = (APP.get(), target_from_id(&id)) {
                    *OPENED.lock().expect("notification target lock poisoned") =
                        Some(target.clone());
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                    let _ = app.emit("notification-open", target);
                }
            }
            completion.call(());
        }
    }
);

pub fn install(app: AppHandle) {
    let _ = APP.set(app);
    static DELEGATE: OnceLock<Retained<MesaNotificationDelegate>> = OnceLock::new();
    let delegate = DELEGATE.get_or_init(|| {
        let allocated = MesaNotificationDelegate::alloc().set_ivars(());
        unsafe { objc2::msg_send![super(allocated), init] }
    });
    UNUserNotificationCenter::currentNotificationCenter()
        .setDelegate(Some(objc2::runtime::ProtocolObject::from_ref(&**delegate)));
}

fn notification_id(id: &str, target: &Target) -> String {
    match target {
        Target::Session { id: session } => format!("mesa/session/{session}/{id}"),
        Target::Inbox => format!("mesa/inbox/{id}"),
        Target::Doctor => format!("mesa/doctor/{id}"),
    }
}

fn target_from_id(id: &str) -> Option<Target> {
    let rest = id.strip_prefix("mesa/")?;
    if let Some(session) = rest.strip_prefix("session/") {
        let (id, _) = session.split_once('/')?;
        if valid_session_id(id) {
            return Some(Target::Session { id: id.into() });
        }
    }
    if rest.starts_with("inbox/") {
        return Some(Target::Inbox);
    }
    if rest.starts_with("doctor/") {
        return Some(Target::Doctor);
    }
    None
}

fn valid_session_id(id: &str) -> bool {
    id.len() == 8
        && id
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit())
}

#[tauri::command]
pub fn notification_take_opened() -> Option<Target> {
    OPENED
        .lock()
        .expect("notification target lock poisoned")
        .take()
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
        if !valid_session_id(id) {
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
    let native_id = notification_id(&id, &target);
    let mut notification = Notification::new()
        .id(&native_id)
        .title(title)
        .message(body);
    if sound {
        notification = notification.default_sound();
    }
    notification.send().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{notification_id, target_from_id, Target};

    #[test]
    fn notification_target_survives_process_restart_in_its_id() {
        let target = Target::Session {
            id: "4x16xscr".into(),
        };
        let id = notification_id("2026-09-29T01:00:00Z:abc", &target);
        assert!(matches!(target_from_id(&id), Some(Target::Session { id }) if id == "4x16xscr"));
        assert!(target_from_id("mesa/session/../../bad").is_none());
    }
}
