//! The macOS app menu: Tauri's default, whose About Mesa opens the app's own About screen (#478),
//! with the links and licenses the native panel lacks, by telling the renderer on `menu://about`.

use tauri::menu::{Menu, MenuItem, MenuItemKind};
use tauri::{App, Emitter};

const ABOUT: &str = "about";

pub fn install(app: &App) -> tauri::Result<()> {
    let menu = Menu::default(app.handle())?;
    // The app menu comes first, and the native About panel first in it.
    if let Some(MenuItemKind::Submenu(app_menu)) = menu.items()?.into_iter().next() {
        app_menu.remove_at(0)?;
        let about = MenuItem::with_id(app, ABOUT, "About Mesa", true, None::<&str>)?;
        app_menu.insert(&about, 0)?;
    }
    app.set_menu(menu)?;
    app.on_menu_event(|app, event| {
        if event.id() == ABOUT {
            let _ = app.emit("menu://about", ());
        }
    });
    Ok(())
}
