import { act } from 'react';

/** The toasts showing, each as its tone and its text. */
export const toasts = (byTestId: (id: string) => HTMLElement[]) =>
  byTestId('toast').map((t) => [t.dataset.tone, t.querySelector('pre')?.textContent]);
/** The toasts' texts. */
export const toastTexts = (byTestId: (id: string) => HTMLElement[]) =>
  byTestId('toast').map((t) => t.querySelector('pre')?.textContent);

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
