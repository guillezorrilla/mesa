use std::ffi::OsStr;
use std::process::Command;
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
static PROFILE: OnceLock<String> = OnceLock::new();
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
                if let (Some(app), Some(current), Some((profile, target))) =
                    (APP.get(), PROFILE.get(), target_from_id(&id))
                {
                    if &profile == current {
                        *OPENED.lock().expect("notification target lock poisoned") =
                            Some(target.clone());
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                        let _ = app.emit("notification-open", target);
                    } else if let Err(error) = open_profile_notice(&profile, &id) {
                        eprintln!("cannot open notification profile {profile}: {error}");
                    }
                }
            }
            completion.call(());
        }
    }
);

pub fn install(app: AppHandle, profile: String, initial_notice: Option<String>) {
    let _ = APP.set(app);
    let _ = PROFILE.set(profile.clone());
    if let Some((origin, target)) = initial_notice.as_deref().and_then(target_from_id) {
        if origin == profile {
            *OPENED.lock().expect("notification target lock poisoned") = Some(target);
        }
    }
    static DELEGATE: OnceLock<Retained<MesaNotificationDelegate>> = OnceLock::new();
    let delegate = DELEGATE.get_or_init(|| {
        let allocated = MesaNotificationDelegate::alloc().set_ivars(());
        unsafe { objc2::msg_send![super(allocated), init] }
    });
    UNUserNotificationCenter::currentNotificationCenter()
        .setDelegate(Some(objc2::runtime::ProtocolObject::from_ref(&**delegate)));
}

fn notification_id(profile: &str, id: &str, target: &Target) -> String {
    format!(
        "mesa:{}",
        serde_json::to_string(&(profile, id, target)).expect("string target")
    )
}

fn target_from_id(id: &str) -> Option<(String, Target)> {
    let (profile, notice, target): (String, String, Target) =
        serde_json::from_str(id.strip_prefix("mesa:")?).ok()?;
    if profile.is_empty() || profile.len() > 100 || notice.is_empty() || notice.len() > 100 {
        return None;
    }
    if let Target::Session { id } = &target {
        if !valid_session_id(id) {
            return None;
        }
    }
    Some((profile, target))
}

fn open_profile_notice(profile: &str, id: &str) -> Result<(), String> {
    let executable = std::env::current_exe().map_err(|error| error.to_string())?;
    if let Some(bundle) = executable
        .ancestors()
        .find(|path| path.extension() == Some(OsStr::new("app")))
    {
        let status = Command::new("/usr/bin/open")
            .arg("-n")
            .arg("-a")
            .arg(bundle)
            .arg("--env")
            .arg(format!("MESA_PROFILE={profile}"))
            .arg("--env")
            .arg(format!("MESA_OPEN_NOTIFICATION={id}"))
            .status()
            .map_err(|error| error.to_string())?;
        if !status.success() {
            return Err(format!("open exited with {status}"));
        }
    } else {
        Command::new(executable)
            .env("MESA_PROFILE", profile)
            .env("MESA_OPEN_NOTIFICATION", id)
            .spawn()
            .map_err(|error| error.to_string())?;
    }
    Ok(())
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
    let profile = PROFILE.get().ok_or("notification profile is unavailable")?;
    let native_id = notification_id(profile, &id, &target);
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
        let id = notification_id("work", "2026-09-29T01:00:00Z:abc", &target);
        assert!(
            matches!(target_from_id(&id), Some((profile, Target::Session { id })) if profile == "work" && id == "4x16xscr")
        );
        assert!(target_from_id(
            "mesa:[\"work\",\"notice\",{\"kind\":\"session\",\"id\":\"../bad\"}]"
        )
        .is_none());
    }
}
