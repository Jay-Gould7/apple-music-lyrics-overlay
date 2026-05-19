import type { MediaState } from './types';

export async function getMediaState(): Promise<MediaState> {
  return window.floatingLyrics.getMediaState();
}

export async function skipMedia(direction: 'previous' | 'next'): Promise<void> {
  await window.floatingLyrics.skipMedia(direction);
}

export async function setClickThrough(enabled: boolean): Promise<void> {
  await window.floatingLyrics.setClickThrough(enabled);
}

export async function setWindowSize(width: number, height: number): Promise<void> {
  await window.floatingLyrics.setWindowSize(width, height);
}

export function onClickThroughChanged(listener: (enabled: boolean) => void): () => void {
  return window.floatingLyrics.onClickThroughChanged(listener);
}

export function onSettingsPanelToggle(listener: () => void): () => void {
  return window.floatingLyrics.onSettingsPanelToggle(listener);
}
