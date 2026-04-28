import type { LyricLine, LyricsResult } from './types';

const CACHE_PREFIX = 'lyrics:';

function normalizePart(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function cleanTrackTitle(value: string): string {
  return value
    .replace(/\s*[\(（][^\)）]*(live|remix|version|feat\.?|with|karaoke)[^\)）]*[\)）]\s*/gi, ' ')
    .replace(/\s*[-–—]\s*(single|ep|album version|remaster(?:ed)?(?:\s*\d{4})?)\s*$/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanArtistName(value: string, title: string): string {
  const cleanedTitle = cleanTrackTitle(title).toLowerCase();

  return value
    .replace(/\s*[-–—]\s*(single|ep|album version|remaster(?:ed)?(?:\s*\d{4})?)\s*$/gi, ' ')
    .replace(/[\s　]*[-–—][\s　]*/g, ' - ')
    .split(' - ')[0]
    .replace(/[\s　]*[·•|｜/][\s　]*.*$/g, ' ')
    .replace(new RegExp(`\s*${cleanedTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\s*$`, 'i'), ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getLyricsKey(title: string, artist: string): string {
  return `${normalizePart(artist)}::${normalizePart(title)}`;
}

export function parseLrc(lrc: string): LyricLine[] {
  const lines: LyricLine[] = [];
  const timestampPattern = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g;

  for (const rawLine of lrc.split(/\r?\n/)) {
    const text = rawLine.replace(timestampPattern, '').trim();
    const matches = [...rawLine.matchAll(timestampPattern)];

    for (const match of matches) {
      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      const fraction = match[3] ?? '0';
      const milliseconds = Number(fraction.padEnd(3, '0').slice(0, 3));

      lines.push({
        timeMs: minutes * 60_000 + seconds * 1_000 + milliseconds,
        text,
      });
    }
  }

  return lines
    .filter((line) => Number.isFinite(line.timeMs))
    .sort((a, b) => a.timeMs - b.timeMs);
}

function readCachedLyrics(key: string): LyricsResult | null {
  const cached = localStorage.getItem(`${CACHE_PREFIX}${key}`);

  if (!cached) {
    return null;
  }

  try {
    return JSON.parse(cached) as LyricsResult;
  } catch {
    localStorage.removeItem(`${CACHE_PREFIX}${key}`);
    return null;
  }
}

function writeCachedLyrics(result: LyricsResult): void {
  localStorage.setItem(`${CACHE_PREFIX}${result.key}`, JSON.stringify(result));
}

type LrcLibTrack = {
  syncedLyrics: string | null;
  plainLyrics: string | null;
};

export async function fetchLyrics(title: string, artist: string): Promise<LyricsResult> {
  const normalizedTitle = cleanTrackTitle(title) || title.trim();
  const normalizedArtist = cleanArtistName(artist, normalizedTitle) || artist.trim();
  const key = getLyricsKey(normalizedTitle, normalizedArtist);
  const cached = readCachedLyrics(key);

  if (cached) {
    return cached;
  }

  const params = new URLSearchParams({ track_name: normalizedTitle, artist_name: normalizedArtist });
  const response = await fetch(`https://lrclib.net/api/get?${params.toString()}`, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const emptyResult: LyricsResult = { key, lines: [], plainText: '', source: 'none' };
    writeCachedLyrics(emptyResult);
    return emptyResult;
  }

  const track = (await response.json()) as LrcLibTrack;
  const lrc = track.syncedLyrics ?? '';
  const result: LyricsResult = {
    key,
    lines: lrc ? parseLrc(lrc) : [],
    plainText: track.plainLyrics ?? '',
    source: lrc ? 'lrclib' : 'none',
  };

  writeCachedLyrics(result);
  return result;
}

export function findActiveLineIndex(lines: LyricLine[], positionMs: number): number {
  if (lines.length === 0) {
    return -1;
  }

  let low = 0;
  let high = lines.length - 1;
  let answer = -1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);

    if (lines[mid].timeMs <= positionMs) {
      answer = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return answer;
}
