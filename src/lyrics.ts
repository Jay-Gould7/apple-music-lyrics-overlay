import type { LyricLine, LyricsResult } from './types';

const CACHE_PREFIX = 'lyrics:';
const LRCLIB_API_BASE = 'https://lrclib.net/api';
const DURATION_MATCH_TOLERANCE_SECONDS = 3;

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

function stripBracketedText(value: string): string {
  return value
    .replace(/\s*[\(\[][^\)\]]+[\)\]]\s*/g, ' ')
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
    const result = JSON.parse(cached) as LyricsResult;

    if (result.source === 'none' || result.lines.length === 0) {
      localStorage.removeItem(`${CACHE_PREFIX}${key}`);
      return null;
    }

    return result;
  } catch {
    localStorage.removeItem(`${CACHE_PREFIX}${key}`);
    return null;
  }
}

function writeCachedLyrics(result: LyricsResult): void {
  if (result.source === 'none' || result.lines.length === 0) {
    return;
  }

  localStorage.setItem(`${CACHE_PREFIX}${result.key}`, JSON.stringify(result));
}

type LrcLibTrack = {
  trackName?: string;
  artistName?: string;
  duration?: number;
  syncedLyrics: string | null;
  plainLyrics: string | null;
};

function createLyricsResult(key: string, track: LrcLibTrack | null): LyricsResult {
  const lrc = track?.syncedLyrics ?? '';

  return {
    key,
    lines: lrc ? parseLrc(lrc) : [],
    plainText: track?.plainLyrics ?? '',
    source: lrc ? 'lrclib' : 'none',
  };
}

function normalizeComparable(value: string): string {
  return normalizePart(value)
    .replace(/[’']/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function uniqueValues(values: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    const key = normalizeComparable(normalized);

    if (!normalized || seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(normalized);
  }

  return unique;
}

function getSearchVariants(title: string, artist: string): Array<{ title: string; artist: string }> {
  const cleanedTitle = cleanTrackTitle(title) || title.trim();
  const unbracketedTitle = stripBracketedText(cleanedTitle) || cleanedTitle;
  const cleanedArtist = cleanArtistName(artist, cleanedTitle) || artist.trim();

  const titleVariants = uniqueValues([
    title,
    cleanedTitle,
    unbracketedTitle,
    stripBracketedText(title),
  ]);
  const artistVariants = uniqueValues([
    artist,
    cleanedArtist,
  ]);
  const variants: Array<{ title: string; artist: string }> = [];
  const seen = new Set<string>();

  for (const nextTitle of titleVariants) {
    for (const nextArtist of artistVariants) {
      const key = `${normalizeComparable(nextTitle)}::${normalizeComparable(nextArtist)}`;

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      variants.push({ title: nextTitle, artist: nextArtist });
    }
  }

  return variants;
}

async function fetchLrcLibTrack(path: string, params: URLSearchParams): Promise<LrcLibTrack | null> {
  const response = await fetch(`${LRCLIB_API_BASE}/${path}?${params.toString()}`, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as LrcLibTrack;
}

async function fetchExactMatch(title: string, artist: string, durationMs?: number): Promise<LrcLibTrack | null> {
  const params = new URLSearchParams({ track_name: title, artist_name: artist });

  if (durationMs && durationMs > 0) {
    params.set('duration', Math.round(durationMs / 1000).toString());
  }

  return fetchLrcLibTrack('get', params);
}

async function searchLrcLib(title: string, artist: string): Promise<LrcLibTrack[]> {
  const params = new URLSearchParams({ track_name: title, artist_name: artist });
  const response = await fetch(`${LRCLIB_API_BASE}/search?${params.toString()}`, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    return [];
  }

  return (await response.json()) as LrcLibTrack[];
}

function scoreCandidate(track: LrcLibTrack, title: string, artist: string, durationMs?: number): number {
  const targetTitle = normalizeComparable(title);
  const targetArtist = normalizeComparable(artist);
  const trackTitle = normalizeComparable(track.trackName ?? '');
  const trackArtist = normalizeComparable(track.artistName ?? '');
  let score = 0;

  if (track.syncedLyrics) {
    score += 100;
  }

  if (trackTitle === targetTitle) {
    score += 60;
  } else if (trackTitle.includes(targetTitle) || targetTitle.includes(trackTitle)) {
    score += 25;
  }

  if (trackArtist === targetArtist) {
    score += 40;
  } else if (trackArtist.includes(targetArtist) || targetArtist.includes(trackArtist)) {
    score += 18;
  }

  if (durationMs && durationMs > 0 && track.duration) {
    const difference = Math.abs(track.duration - durationMs / 1000);

    if (difference <= DURATION_MATCH_TOLERANCE_SECONDS) {
      score += 35;
    } else {
      score -= Math.min(30, difference);
    }
  }

  return score;
}

async function searchBestMatch(title: string, artist: string, durationMs?: number): Promise<LrcLibTrack | null> {
  const candidates = await searchLrcLib(title, artist);
  const syncedCandidates = candidates.filter((track) => Boolean(track.syncedLyrics));

  if (syncedCandidates.length === 0) {
    return null;
  }

  return syncedCandidates
    .sort((a, b) => scoreCandidate(b, title, artist, durationMs) - scoreCandidate(a, title, artist, durationMs))[0];
}

export async function fetchLyrics(title: string, artist: string, durationMs?: number): Promise<LyricsResult> {
  const normalizedTitle = cleanTrackTitle(title) || title.trim();
  const normalizedArtist = cleanArtistName(artist, normalizedTitle) || artist.trim();
  const key = getLyricsKey(normalizedTitle, normalizedArtist);
  const cached = readCachedLyrics(key);

  if (cached) {
    return cached;
  }

  for (const variant of getSearchVariants(title, artist)) {
    const exactResult = createLyricsResult(key, await fetchExactMatch(variant.title, variant.artist, durationMs));

    if (exactResult.lines.length > 0) {
      writeCachedLyrics(exactResult);
      return exactResult;
    }
  }

  for (const variant of getSearchVariants(title, artist)) {
    const searchResult = createLyricsResult(key, await searchBestMatch(variant.title, variant.artist, durationMs));

    if (searchResult.lines.length > 0) {
      writeCachedLyrics(searchResult);
      return searchResult;
    }
  }

  return { key, lines: [], plainText: '', source: 'none' };
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
