export type PlaybackStatus = 'playing' | 'paused' | 'stopped' | 'unknown';

export type MediaState = {
  title: string;
  artist: string;
  album: string;
  positionMs: number;
  durationMs: number;
  status: PlaybackStatus;
  sourceAppId: string;
};

export type LyricLine = {
  timeMs: number;
  text: string;
};

export type LyricsResult = {
  key: string;
  lines: LyricLine[];
  plainText: string;
  source: 'lrclib' | 'none';
};
