use std::ffi::OsStr;
use std::io::Read;
use std::path::PathBuf;
use std::process::Command;
use std::sync::{Mutex, OnceLock};

use block2::DynBlock;
use mac_usernotifications::{
    get_notification_settings, request_auth, AuthorizationStatus, Notification,
    NotificationSettingStatus,
};
use objc2::{define_class, rc::Retained, AnyThread};
use objc2_foundation::{NSBundle, NSObject, NSObjectProtocol};
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
    Automations,
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

pub async fn install(
    app: AppHandle,
    profile: String,
    initial_notice: Option<String>,
) -> Result<(), String> {
    let _ = APP.set(app);
    let _ = PROFILE.set(profile.clone());
    if let Some((origin, target)) = initial_notice.as_deref().and_then(target_from_id) {
        if origin == profile {
            *OPENED.lock().expect("notification target lock poisoned") = Some(target);
        }
    }
    require_bundle()?;
    // The library installs its delegate first; Mesa then owns notification clicks.
    let _ = get_notification_settings().await;
    static DELEGATE: OnceLock<Retained<MesaNotificationDelegate>> = OnceLock::new();
    let delegate = DELEGATE.get_or_init(|| {
        let allocated = MesaNotificationDelegate::alloc().set_ivars(());
        unsafe { objc2::msg_send![super(allocated), init] }
    });
    UNUserNotificationCenter::currentNotificationCenter()
        .setDelegate(Some(objc2::runtime::ProtocolObject::from_ref(&**delegate)));
    Ok(())
}

fn require_bundle() -> Result<(), String> {
    if NSBundle::mainBundle()
        .bundleURL()
        .pathExtension()
        .is_some_and(|extension| extension.to_string() == "app")
    {
        Ok(())
    } else {
        Err("Notifications require a bundled Mesa.app; they are unavailable in pnpm dev".into())
    }
}

pub fn bundled_executable() -> Option<PathBuf> {
    require_bundle().ok()?;
    std::env::current_exe().ok()
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackgroundNotice {
    profile: String,
    id: String,
    title: String,
    body: String,
    sound: bool,
    target: Target,
}

/// A short-lived bundled process uses the same native owner; no window or permission prompt.
pub fn background(args: &[String]) -> Option<Result<(), String>> {
    if args.first().map(String::as_str) != Some("--mesa-notification") {
        return None;
    }
    Some(mac_usernotifications::block_on_main(async {
        match args.get(1).map(String::as_str) {
            Some("status") if args.len() == 2 => {
                println!(
                    "{}",
                    serde_json::to_string(&notification_status().await?)
                        .map_err(|e| e.to_string())?
                );
                Ok(())
            }
            Some("send") if args.len() == 2 => {
                let mut input = String::new();
                std::io::stdin()
                    .take(65_537)
                    .read_to_string(&mut input)
                    .map_err(|e| e.to_string())?;
                if input.len() > 65_536 {
                    return Err("notification input is too long".into());
                }
                let notice: BackgroundNotice =
                    serde_json::from_str(&input).map_err(|e| e.to_string())?;
                if notice.profile.is_empty() || notice.profile.len() > 100 {
                    return Err("invalid notification profile".into());
                }
                PROFILE
                    .set(notice.profile)
                    .map_err(|_| "notification profile already set")?;
                notification_send(
                    notice.id,
                    notice.title,
                    notice.body,
                    notice.sound,
                    notice.target,
                )
                .await
            }
            _ => Err("use --mesa-notification status|send".into()),
        }
    }))
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
    require_bundle()?;
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
    require_bundle()?;
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
    if id.is_empty() || id.len() > 100 || title.chars().count() > 150 || body.chars().count() > 300
    {
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
    fn unbundled_status_and_permission_refuse_before_native_notification_calls() {
        for result in [
            tauri::async_runtime::block_on(super::notification_status()),
            tauri::async_runtime::block_on(super::notification_request_permission()),
        ] {
            assert!(matches!(result, Err(error) if error.contains("bundled Mesa.app")));
        }
    }

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
        assert!(
            matches!(target_from_id(&notification_id("work", "failure", &Target::Automations)), Some((profile, Target::Automations)) if profile == "work")
        );
        assert!(
            matches!(target_from_id(&notification_id("work.1", "failure", &Target::Automations)), Some((profile, Target::Automations)) if profile == "work.1")
        );
    }

    #[test]
    fn background_entrypoint_is_explicit_and_refuses_unbundled_native_calls() {
        assert!(super::background(&["normal".into()]).is_none());
        assert!(
            matches!(super::background(&["--mesa-notification".into(), "status".into()]), Some(Err(error)) if error.contains("bundled Mesa.app"))
        );
        assert!(
            matches!(super::background(&["--mesa-notification".into(), "unknown".into()]), Some(Err(error)) if error.contains("status|send"))
        );
    }
}
