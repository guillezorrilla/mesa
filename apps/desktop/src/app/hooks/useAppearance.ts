import type { Config } from '@mesa/core';
import { DEFAULT_APPEARANCE } from '@mesa/core/browser';
import { useLayoutEffect } from 'react';

/**
 * Applies the profile's appearance (theme, font, size, density, color vision) to the document root,
 * before the frame paints, so the first frame is never in the wrong theme.
 */
export function useAppearance(choices: Config['appearance'] | undefined) {
  const appearance = choices ?? DEFAULT_APPEARANCE;
  useLayoutEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    const applyTheme = () => {
      root.dataset.theme =
        appearance.theme === 'system' ? (media?.matches ? 'dark' : 'light') : appearance.theme;
    };
    applyTheme();
    media?.addEventListener('change', applyTheme);
    root.dataset.font = appearance.font;
    root.dataset.density = appearance.density;
    root.dataset.colorVision = appearance.colorVision;
    root.style.fontSize = `${appearance.fontSize}px`;
    return () => {
      media?.removeEventListener('change', applyTheme);
      delete root.dataset.theme;
      delete root.dataset.font;
      delete root.dataset.density;
      delete root.dataset.colorVision;
      root.style.removeProperty('font-size');
    };
  }, [
    appearance.theme,
    appearance.font,
    appearance.fontSize,
    appearance.density,
    appearance.colorVision,
  ]);
}
