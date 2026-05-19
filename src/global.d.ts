import type { MediaState } from './types';

declare global {
  interface Window {
    floatingLyrics: {
      getMediaState: () => Promise<MediaState>;
      skipMedia: (direction: 'previous' | 'next') => Promise<void>;
      setClickThrough: (enabled: boolean) => Promise<void>;
      setWindowSize: (width: number, height: number) => Promise<void>;
      onClickThroughChanged: (listener: (enabled: boolean) => void) => () => void;
      onSettingsPanelToggle: (listener: () => void) => () => void;
    };
  }
}

export {};
