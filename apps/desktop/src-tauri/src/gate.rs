//! What a long-lived child prints before the renderer listens (Tauri events are not buffered):
//! held, then passed on in order once it is ready. The terminal (terminal.rs) and the chat follow
//! (follow.rs) each keep one per child.

pub struct Gate<T> {
    ready: bool,
    held: Vec<T>,
    /// The child ended before the renderer listened: it is told once it does (the terminal's).
    pub exited: bool,
}

impl<T> Default for Gate<T> {
    fn default() -> Self {
        Self {
            ready: false,
            held: Vec::new(),
            exited: false,
        }
    }
}

impl<T> Gate<T> {
    /// Passes `item` to `emit` once the renderer listens, else holds it; `emit`'s answer, or true.
    pub fn pass(&mut self, item: T, emit: impl FnOnce(T) -> bool) -> bool {
        if self.ready {
            emit(item)
        } else {
            self.held.push(item);
            true
        }
    }

    pub fn is_ready(&self) -> bool {
        self.ready
    }

    /// The renderer listens now: what was held, oldest first, for the caller to send.
    pub fn open(&mut self) -> Vec<T> {
        self.ready = true;
        std::mem::take(&mut self.held)
    }
}

#[cfg(test)]
mod tests {
    use super::Gate;

    #[test]
    fn a_gate_holds_until_open_then_passes_through() {
        let mut gate = Gate::default();
        let mut sent = Vec::new();
        gate.pass("a", |x| {
            sent.push(x);
            true
        });
        assert!(sent.is_empty());
        assert_eq!(gate.open(), ["a"]);
        gate.pass("b", |x| {
            sent.push(x);
            true
        });
        assert_eq!(sent, ["b"]);
    }
}
