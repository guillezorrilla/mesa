//! What the updater knows, apart from Tauri: the status the renderer shows, when and on which
//! channel the feeds were last read, and the verified download waiting for Install. Each step of a
//! check is a method here, so the schedule, the floor and every outcome are testable without an app.

use std::time::{Duration, SystemTime};

use serde::Serialize;
use serde_json::Value;

/// How often the schedule reads the feeds, in wall-clock time, so a Mac that sleeps still checks.
pub const EVERY: Duration = Duration::from_secs(4 * 60 * 60);
/// No two checks of one channel come closer than this, unless the link asks or a person retries
/// a failure.
pub const FLOOR: Duration = Duration::from_secs(10 * 60);

/// Who asked for a check.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Trigger {
    /// The launch and 4-hourly schedule.
    Schedule,
    /// The profile menu, Settings or the revoked dialog: shows a dismissed update again.
    Person,
    /// `mesa update install`, which has just found a newer version: always reaches the feeds.
    Link,
}

/// What the renderer shows: the step, the newer version, and a revocation of the running one.
#[derive(Clone, Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    /// idle, checking, downloading, ready, up-to-date, unsupported or failed.
    pub phase: &'static str,
    pub version: Option<String>,
    pub channel: Option<String>,
    /// Why the check failed, or why this build cannot update itself.
    pub message: Option<String>,
    /// Where to download Mesa by hand.
    pub page: Option<String>,
    /// `{version, reason}` when the running version is revoked.
    pub revoked: Option<Value>,
    /// Later was chosen for `version`: hidden until a newer one, a person's check, or a relaunch.
    pub dismissed: bool,
}

impl Default for Status {
    fn default() -> Self {
        Status {
            phase: "idle",
            version: None,
            channel: None,
            message: None,
            page: None,
            revoked: None,
            dismissed: false,
        }
    }
}

/// A verified download of `version`; `payload` is the plugin's update and bytes in the app.
pub struct Ready<T> {
    pub version: String,
    pub payload: T,
}

pub struct State<T> {
    pub status: Status,
    /// When, and on which channel, the last check reached the feeds, whatever its outcome.
    last: Option<(SystemTime, String)>,
    ready: Option<Ready<T>>,
}

impl<T> Default for State<T> {
    fn default() -> Self {
        State {
            status: Status::default(),
            last: None,
            ready: None,
        }
    }
}

/// How long ago `at` was; a clock set back counts as long ago.
fn since(now: SystemTime, at: SystemTime) -> Duration {
    now.duration_since(at).unwrap_or(Duration::MAX)
}

impl<T> State<T> {
    /// Whether the schedule should check now: never checked, or the last check is `EVERY` old.
    pub fn due(&self, now: SystemTime) -> bool {
        self.last
            .as_ref()
            .is_none_or(|(at, _)| since(now, *at) >= EVERY)
    }

    /// Starts a check of `channel`, and says whether it reaches the feeds. Inside the floor it
    /// keeps the last result, except for the link and a person retrying a failure.
    pub fn begin(&mut self, channel: &str, trigger: Trigger, now: SystemTime) -> bool {
        if trigger != Trigger::Schedule {
            self.status.dismissed = false;
        }
        let recent =
            matches!(&self.last, Some((at, on)) if on == channel && since(now, *at) < FLOOR);
        let reach = match trigger {
            Trigger::Schedule => !recent,
            Trigger::Person => !recent || self.status.phase == "failed",
            Trigger::Link => true,
        };
        if reach && self.status.phase != "ready" {
            self.status.phase = "checking";
        }
        reach
    }

    /// Takes `mesa update check`'s answer, and returns the feed to download from when a newer
    /// version needs downloading. `unsupported` is why this build cannot replace itself.
    pub fn checked(
        &mut self,
        channel: String,
        found: Result<Value, String>,
        unsupported: Option<String>,
        now: SystemTime,
    ) -> Option<String> {
        self.last = Some((now, channel));
        let found = match found {
            Ok(found) => found,
            Err(message) => {
                self.fail(message);
                return None;
            }
        };
        let latest = found["latest"].as_str().map(str::to_string);
        let status = &mut self.status;
        status.channel = found["channel"].as_str().map(str::to_string);
        status.page = found["page"].as_str().map(str::to_string);
        status.revoked = Some(found["revoked"].clone()).filter(|r| !r.is_null());
        status.message = None;
        if status.version != latest {
            status.dismissed = false;
        }
        status.version = latest.clone();
        if found["available"] != true {
            status.phase = "up-to-date";
            self.ready = None;
            return None;
        }
        if let Some(reason) = unsupported {
            status.phase = "unsupported";
            status.message = Some(reason);
            return None;
        }
        if self
            .ready
            .as_ref()
            .is_some_and(|ready| Some(&ready.version) == latest.as_ref())
        {
            status.phase = "ready";
            return None;
        }
        match found["feed"].as_str() {
            Some(feed) => {
                status.phase = "downloading";
                Some(feed.to_string())
            }
            None => {
                self.fail("The check named no feed to download from.".into());
                None
            }
        }
    }

    /// Takes the download's outcome.
    pub fn downloaded(&mut self, result: Result<Ready<T>, String>) {
        match result {
            Ok(ready) => {
                self.status.phase = "ready";
                self.status.version = Some(ready.version.clone());
                self.ready = Some(ready);
            }
            Err(message) => self.fail(message),
        }
    }

    /// A failed check or download. A verified download already here is still newer than the
    /// running version, so it stays offered.
    fn fail(&mut self, message: String) {
        self.status.message = Some(message);
        match &self.ready {
            Some(ready) => {
                self.status.phase = "ready";
                self.status.version = Some(ready.version.clone());
            }
            None => self.status.phase = "failed",
        }
    }

    /// Later: hides the update until a newer one, a person's check, or a relaunch.
    pub fn later(&mut self) {
        self.status.dismissed = true;
    }

    /// The verified download, for Install.
    pub fn take_ready(&mut self) -> Option<Ready<T>> {
        self.ready.take()
    }

    /// Install failed: says why, and keeps the download, so a person's check offers it again
    /// without downloading it twice.
    pub fn install_failed(&mut self, ready: Ready<T>, error: &str) {
        self.status.phase = "failed";
        self.status.message = Some(format!("Installing {} failed: {error}", ready.version));
        self.ready = Some(ready);
    }

    /// The running version's revocation, read at launch.
    pub fn set_revoked(&mut self, revoked: Value) {
        self.status.revoked = Some(revoked).filter(|r| !r.is_null());
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const T0: SystemTime = SystemTime::UNIX_EPOCH;
    const MIN: Duration = Duration::from_secs(60);

    fn at(minutes: u64) -> SystemTime {
        T0 + MIN * minutes as u32
    }

    fn newer(version: &str) -> Value {
        json!({
            "current": "0.1.0-beta.4", "channel": "beta", "available": true, "latest": version,
            "feed": "https://feeds.example.test/beta.json", "page": "https://example.test/releases",
        })
    }

    fn current() -> Value {
        json!({ "current": "0.1.0-beta.4", "channel": "stable", "available": false,
                "latest": "0.0.9", "page": "https://example.test/releases" })
    }

    fn ready(version: &str) -> Result<Ready<()>, String> {
        Ok(Ready {
            version: version.into(),
            payload: (),
        })
    }

    /// A state that checked `beta` at minute 0 and holds a verified beta.5.
    fn holding_beta5() -> State<()> {
        let mut state = State::default();
        assert!(state.begin("beta", Trigger::Schedule, at(0)));
        let feed = state.checked("beta".into(), Ok(newer("0.1.0-beta.5")), None, at(0));
        assert_eq!(
            feed.as_deref(),
            Some("https://feeds.example.test/beta.json")
        );
        assert_eq!(state.status.phase, "downloading");
        state.downloaded(ready("0.1.0-beta.5"));
        state
    }

    #[test]
    fn the_floor_keeps_the_last_result_for_ten_minutes_per_channel() {
        let mut state = holding_beta5();
        state.later();
        assert!(!state.begin("beta", Trigger::Schedule, at(9)));
        // A person inside the floor gets the last result, and sees a dismissed update again.
        assert!(!state.begin("beta", Trigger::Person, at(9)));
        assert!(!state.status.dismissed);
        assert_eq!(state.status.phase, "ready");
        assert!(state.begin("beta", Trigger::Person, at(10)));
        // Another channel is not inside the floor.
        let mut other = holding_beta5();
        assert!(other.begin("stable", Trigger::Person, at(1)));
    }

    #[test]
    fn a_channel_switch_mid_download_drops_the_old_channels_update() {
        // The switch's check waits for the beta download, then reads stable, where nothing is
        // newer than the running beta: the beta download is dropped, not offered.
        let mut state = holding_beta5();
        assert!(state.begin("stable", Trigger::Person, at(1)));
        assert_eq!(
            state.checked("stable".into(), Ok(current()), None, at(1)),
            None
        );
        assert_eq!(state.status.phase, "up-to-date");
        assert_eq!(state.status.channel.as_deref(), Some("stable"));
        assert!(state.take_ready().is_none());
    }

    #[test]
    fn a_build_that_cannot_replace_itself_says_why_and_downloads_nothing() {
        let mut state = State::<()>::default();
        state.begin("beta", Trigger::Person, at(0));
        let why = "This is a development build, which does not update itself.";
        let feed = state.checked(
            "beta".into(),
            Ok(newer("0.1.0-beta.5")),
            Some(why.into()),
            at(0),
        );
        assert_eq!(feed, None);
        assert_eq!(state.status.phase, "unsupported");
        assert_eq!(state.status.message.as_deref(), Some(why));
        assert_eq!(
            state.status.page.as_deref(),
            Some("https://example.test/releases")
        );
    }

    #[test]
    fn later_holds_until_a_newer_version_or_a_person_asks() {
        let mut state = holding_beta5();
        state.later();
        // The schedule finds the same version: still dismissed.
        state.begin("beta", Trigger::Schedule, at(240));
        state.checked("beta".into(), Ok(newer("0.1.0-beta.5")), None, at(240));
        assert!(state.status.dismissed);
        // A newer one shows again.
        state.begin("beta", Trigger::Schedule, at(480));
        state.checked("beta".into(), Ok(newer("0.1.0-beta.6")), None, at(480));
        assert!(!state.status.dismissed);
        state.downloaded(ready("0.1.0-beta.6"));
        state.later();
        state.begin("beta", Trigger::Person, at(481));
        assert!(!state.status.dismissed);
    }

    #[test]
    fn revocation_comes_from_launch_and_each_check_and_survives_a_failed_one() {
        let mut state = State::<()>::default();
        state.set_revoked(json!({ "version": "0.1.0-beta.4", "reason": "Loses logs" }));
        assert!(state.status.revoked.is_some());
        state.begin("beta", Trigger::Person, at(0));
        state.checked("beta".into(), Err("offline".into()), None, at(0));
        assert!(state.status.revoked.is_some());
        state.begin("beta", Trigger::Person, at(1));
        state.checked("beta".into(), Ok(current()), None, at(1));
        assert_eq!(state.status.revoked, None);
        state.set_revoked(Value::Null);
        assert_eq!(state.status.revoked, None);
    }

    #[test]
    fn the_link_always_reaches_the_feeds_even_right_after_another_check() {
        // `mesa update install` may land while the schedule's check holds the lock; once that
        // check is done the link's still reads the feeds, inside the floor.
        let mut state = holding_beta5();
        assert!(state.begin("beta", Trigger::Link, at(0)));
        // The verified download of the same version is reused, not downloaded again.
        assert_eq!(
            state.checked("beta".into(), Ok(newer("0.1.0-beta.5")), None, at(0)),
            None
        );
        assert_eq!(state.status.phase, "ready");
    }

    #[test]
    fn a_person_retries_a_failure_inside_the_floor() {
        let mut state = State::<()>::default();
        state.begin("beta", Trigger::Person, at(0));
        let feed = state.checked("beta".into(), Ok(newer("0.1.0-beta.5")), None, at(0));
        assert!(feed.is_some());
        state.downloaded(Err(
            "The update to 0.1.0-beta.5 was refused: timeout.".into()
        ));
        assert_eq!(state.status.phase, "failed");
        // The schedule waits; a person's retry downloads again at once.
        assert!(!state.begin("beta", Trigger::Schedule, at(1)));
        assert!(state.begin("beta", Trigger::Person, at(1)));
        assert_eq!(state.status.phase, "checking");
        assert!(state
            .checked("beta".into(), Ok(newer("0.1.0-beta.5")), None, at(1))
            .is_some());
        state.downloaded(ready("0.1.0-beta.5"));
        assert_eq!(state.status.phase, "ready");
        assert_eq!(state.status.message, None);
    }

    #[test]
    fn a_failed_check_or_download_keeps_a_verified_update_offered() {
        let mut state = holding_beta5();
        state.begin("beta", Trigger::Person, at(11));
        state.checked("beta".into(), Err("HTTP 503".into()), None, at(11));
        assert_eq!(state.status.phase, "ready");
        assert_eq!(state.status.version.as_deref(), Some("0.1.0-beta.5"));
        // A newer version that fails to download leaves the older verified one to install.
        state.begin("beta", Trigger::Person, at(22));
        state.checked("beta".into(), Ok(newer("0.1.0-beta.6")), None, at(22));
        state.downloaded(Err("refused".into()));
        assert_eq!(state.status.phase, "ready");
        assert_eq!(state.status.version.as_deref(), Some("0.1.0-beta.5"));
        assert_eq!(
            state.take_ready().map(|r| r.version).as_deref(),
            Some("0.1.0-beta.5")
        );
    }

    #[test]
    fn a_failed_install_keeps_the_download_for_the_next_try() {
        let mut state = holding_beta5();
        let taken = state.take_ready().unwrap();
        state.install_failed(taken, "Permission denied");
        assert_eq!(state.status.phase, "failed");
        assert_eq!(
            state.status.message.as_deref(),
            Some("Installing 0.1.0-beta.5 failed: Permission denied")
        );
        assert!(state.begin("beta", Trigger::Person, at(1)));
        assert_eq!(
            state.checked("beta".into(), Ok(newer("0.1.0-beta.5")), None, at(1)),
            None
        );
        assert_eq!(state.status.phase, "ready");
    }

    #[test]
    fn the_schedule_is_due_at_first_then_every_four_hours_of_wall_clock() {
        let mut state = State::<()>::default();
        assert!(state.due(at(0)));
        state.begin("beta", Trigger::Schedule, at(0));
        state.checked("beta".into(), Ok(current()), None, at(0));
        assert!(!state.due(at(239)));
        assert!(state.due(at(240)));
        // A clock set back does not stall the schedule.
        assert!(state.due(T0 - MIN));
    }

    #[test]
    fn a_check_without_a_feed_fails_instead_of_downloading_forever() {
        let mut state = State::<()>::default();
        state.begin("beta", Trigger::Person, at(0));
        let mut found = newer("0.1.0-beta.5");
        found.as_object_mut().unwrap().remove("feed");
        assert_eq!(state.checked("beta".into(), Ok(found), None, at(0)), None);
        assert_eq!(state.status.phase, "failed");
    }
}
