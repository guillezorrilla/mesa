import { act } from 'react';

/** The toasts showing, each as its tone and its text. */
export const toasts = (byTestId: (id: string) => HTMLElement[]) =>
  byTestId('toast').map((t) => [t.dataset.tone, t.querySelector('pre')?.textContent]);
/** The toasts' texts. */
export const toastTexts = (byTestId: (id: string) => HTMLElement[]) =>
  byTestId('toast').map((t) => t.querySelector('pre')?.textContent);

/** Types `value` into `input` as a person does: the input event React's onChange reads. */
const typeInto = (input: HTMLInputElement | HTMLTextAreaElement, value: string) =>
  act(async () => {
    const field =
      input instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(field, 'value')?.set?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });

/** Types `value` into `input` (or a textarea), or the one with that id. */
export const fill = (
  input: string | HTMLInputElement | HTMLTextAreaElement | null | undefined,
  value: string,
) =>
  typeInto(
    (typeof input === 'string' ? document.getElementById(input) : input) as
      | HTMLInputElement
      | HTMLTextAreaElement,
    value,
  );

/** Types `text` into the command palette's query, found by test id: cmdk owns the input's id. */
export const searchFor = (text: string) => {
  const input = document.querySelector<HTMLInputElement>('[data-testid="palette-query"]');
  if (!input) throw new Error('the command palette is not open');
  return typeInto(input, text);
};

/** Presses `key` on `element`, with any modifiers: one keydown that bubbles. */
export const press = (
  element: Element | null | undefined,
  key: string,
  keys: KeyboardEventInit = {},
) =>
  act(async () => {
    element?.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...keys }),
    );
  });

/** Dispatches a primary-button pointer event of `type` on `target`, at `at`. */
export const pointer = (
  target: EventTarget,
  type: string,
  at: { clientX?: number; clientY?: number } = {},
) =>
  act(async () => {
    target.dispatchEvent(
      new PointerEvent(type, { bubbles: true, button: 0, pointerType: 'mouse', ...at }),
    );
  });

export const click = (element: HTMLElement | undefined) =>
  act(async () => {
    element?.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' }),
    );
    element?.click();
  });

/** Picks `value` in a select as a person does: the change event React's onChange reads. */
export const choose = (select: HTMLElement | undefined, value: string) =>
  act(async () => {
    (select as HTMLSelectElement).value = value;
    select?.dispatchEvent(new Event('change', { bubbles: true }));
  });

export const cells = (row: HTMLElement | undefined) =>
  [...(row?.querySelectorAll('td') ?? [])].map((td) => td.textContent);

/** Lets a terminal attach: the fake pty's open and ready settle. */
export const attached = () => act(async () => new Promise((done) => setTimeout(done, 20)));
