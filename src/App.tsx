import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { fetchLyrics, findActiveLineIndex, getLyricsKey } from './lyrics';
import { getMediaState, onClickThroughChanged, onSettingsPanelToggle, setClickThrough, setWindowSize } from './desktop';
import type { LyricsResult, MediaState } from './types';

const EMPTY_MEDIA: MediaState = {
  title: '',
  artist: '',
  album: '',
  positionMs: 0,
  durationMs: 0,
  status: 'unknown',
  sourceAppId: '',
};

const LYRIC_SYNC_OFFSET_MS = 650;
const DEFAULT_SETTINGS = {
  activeColor: '#fff6a6',
  inactiveColor: 'rgba(255, 255, 255, 0.34)',
  fontSize: 23,
  windowWidth: 980,
  windowHeight: 180,
};

type DisplaySettings = typeof DEFAULT_SETTINGS;

function readDisplaySettings(): DisplaySettings {
  const raw = localStorage.getItem('display-settings');

  if (!raw) {
    return DEFAULT_SETTINGS;
  }

  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatPlaybackStatus(status: MediaState['status']): string {
  if (status === 'playing') {
    return '播放中';
  }

  if (status === 'paused') {
    return '已暂停';
  }

  if (status === 'stopped') {
    return '已停止';
  }

  return '未知状态';
}

function App() {
  const [media, setMedia] = useState<MediaState>(EMPTY_MEDIA);
  const [lyrics, setLyrics] = useState<LyricsResult | null>(null);
  const [lyricsState, setLyricsState] = useState<'idle' | 'loading' | 'ready' | 'missing' | 'error'>('idle');
  const [positionMs, setPositionMs] = useState(0);
  const [clickThroughEnabled, setClickThroughEnabled] = useState(false);
  const [settingsPanelVisible, setSettingsPanelVisible] = useState(false);
  const [lastError, setLastError] = useState('');
  const [settings, setSettings] = useState<DisplaySettings>(() => readDisplaySettings());
  const activeLineRef = useRef<HTMLDivElement | null>(null);
  const mediaRef = useRef(media);
  const clockRef = useRef({ positionMs: 0, receivedAt: performance.now(), status: media.status });
  const resizeRef = useRef({ active: false, startX: 0, startY: 0, width: settings.windowWidth, height: settings.windowHeight });

  const trackKey = useMemo(() => {
    if (!media.title || !media.artist) {
      return '';
    }

    return getLyricsKey(media.title, media.artist);
  }, [media.artist, media.title]);

  const activeLineIndex = useMemo(() => {
    return lyrics ? findActiveLineIndex(lyrics.lines, positionMs + LYRIC_SYNC_OFFSET_MS) : -1;
  }, [lyrics, positionMs]);

  const updateMedia = useCallback((nextMedia: MediaState) => {
    setMedia(nextMedia);
    mediaRef.current = nextMedia;
    clockRef.current = {
      positionMs: nextMedia.positionMs,
      receivedAt: performance.now(),
      status: nextMedia.status,
    };
  }, []);

  const toggleClickThrough = useCallback(async () => {
    const nextEnabled = !clickThroughEnabled;
    await setClickThrough(nextEnabled);
    setClickThroughEnabled(nextEnabled);
    if (nextEnabled) {
      setSettingsPanelVisible(false);
    }
  }, [clickThroughEnabled]);

  const unlockInteraction = useCallback(async () => {
    await setClickThrough(false);
    setClickThroughEnabled(false);
  }, []);

  const updateSettings = useCallback((nextSettings: Partial<DisplaySettings>) => {
    setSettings((currentSettings) => {
      const mergedSettings = { ...currentSettings, ...nextSettings };
      localStorage.setItem('display-settings', JSON.stringify(mergedSettings));
      return mergedSettings;
    });
  }, []);

  useEffect(() => {
    let disposed = false;

    async function pollMedia() {
      try {
        const nextMedia = await getMediaState();

        if (!disposed) {
          updateMedia(nextMedia);
          setLastError('');
        }
      } catch (error) {
        if (!disposed) {
          setLastError(error instanceof Error ? error.message : 'Failed to read media state.');
        }
      }
    }

    pollMedia();
    const intervalId = window.setInterval(pollMedia, 800);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
    };
  }, [updateMedia]);

  useEffect(() => {
    let frameId = 0;

    function tick() {
      const clock = clockRef.current;
      const elapsed = clock.status === 'playing' ? performance.now() - clock.receivedAt : 0;
      setPositionMs(clock.positionMs + elapsed);
      frameId = window.requestAnimationFrame(tick);
    }

    frameId = window.requestAnimationFrame(tick);

    return () => window.cancelAnimationFrame(frameId);
  }, []);

  useEffect(() => {
    if (!trackKey || !media.title || !media.artist) {
      setLyrics(null);
      setLyricsState('idle');
      return;
    }

    let disposed = false;
    setLyricsState('loading');

    fetchLyrics(media.title, media.artist)
      .then((result) => {
        if (disposed) {
          return;
        }

        setLyrics(result);
        setLyricsState(result.lines.length > 0 ? 'ready' : 'missing');
      })
      .catch(() => {
        if (!disposed) {
          setLyrics(null);
          setLyricsState('error');
        }
      });

    return () => {
      disposed = true;
    };
  }, [media.artist, media.title, trackKey]);

  useEffect(() => {
    activeLineRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [activeLineIndex]);

  useEffect(() => {
    return onClickThroughChanged((enabled: boolean) => {
      setClickThroughEnabled(enabled);
      if (enabled) {
        setSettingsPanelVisible(false);
      }
    });
  }, []);

  useEffect(() => {
    return onSettingsPanelToggle(() => {
      setClickThroughEnabled(false);
      setSettingsPanelVisible((visible) => !visible);
    });
  }, []);

  useEffect(() => {
    setWindowSize(settings.windowWidth, settings.windowHeight).catch(() => {
      setLastError('窗口大小调整失败');
    });
  }, [settings.windowHeight, settings.windowWidth]);

  useEffect(() => {
    async function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && clickThroughEnabled) {
        await unlockInteraction();
      } else if (event.key === 'Escape') {
        setSettingsPanelVisible(false);
      }
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [clickThroughEnabled, unlockInteraction]);

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      if (!resizeRef.current.active) {
        return;
      }

      const nextWidth = Math.max(520, Math.min(1400, resizeRef.current.width + event.screenX - resizeRef.current.startX));
      const nextHeight = Math.max(120, Math.min(520, resizeRef.current.height + event.screenY - resizeRef.current.startY));
      updateSettings({ windowWidth: nextWidth, windowHeight: nextHeight });
    }

    function handlePointerUp() {
      resizeRef.current.active = false;
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [updateSettings]);

  const startResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    resizeRef.current = {
      active: true,
      startX: event.screenX,
      startY: event.screenY,
      width: settings.windowWidth,
      height: settings.windowHeight,
    };
  }, [settings.windowHeight, settings.windowWidth]);

  const headline = media.title || '等待 Apple Music';
  const subline = media.artist ? `${media.artist}${media.album ? ` · ${media.album}` : ''}` : '请先在 Apple Music 播放歌曲';
  const statusText = lyricsState === 'loading'
    ? '正在查找歌词...'
    : lyricsState === 'missing'
      ? '未找到同步歌词'
      : lyricsState === 'error'
        ? '歌词加载失败'
        : media.status === 'paused'
          ? '已暂停'
          : '';

  return (
    <main
      className="app-shell"
      data-click-through={clickThroughEnabled}
      data-settings-visible={settingsPanelVisible}
      style={{
        '--active-lyric-color': settings.activeColor,
        '--inactive-lyric-color': settings.inactiveColor,
        '--lyric-font-size': `${settings.fontSize}px`,
      } as CSSProperties}
    >
      <section className="lyric-window" onDoubleClick={unlockInteraction}>
        <div className="hover-panel">
          <div className="track-meta">
            <div className="track-title">{headline}</div>
            <div className="track-artist">{subline}</div>
          </div>

          <div className="settings-grid">
            <label>
              主歌词
              <input
                type="color"
                value={settings.activeColor}
                onChange={(event) => updateSettings({ activeColor: event.target.value })}
              />
            </label>
            <label>
              副歌词
              <input
                type="color"
                value={settings.inactiveColor.startsWith('#') ? settings.inactiveColor : '#ffffff'}
                onChange={(event) => updateSettings({ inactiveColor: event.target.value })}
              />
            </label>
            <label>
              字号 {settings.fontSize}px
              <input
                min="16"
                max="52"
                type="range"
                value={settings.fontSize}
                onChange={(event) => updateSettings({ fontSize: Number(event.target.value) })}
              />
            </label>
          </div>

          <button className="lock-button" type="button" onClick={toggleClickThrough}>
            锁定穿透
          </button>
        </div>

        <div className="lyrics-viewport">
          {lyricsState === 'ready' && lyrics ? (
            <div className="lyrics-list">
              {lyrics.lines.map((line, index) => (
                <div
                  ref={index === activeLineIndex ? activeLineRef : null}
                  className={index === activeLineIndex ? 'lyric-line active' : 'lyric-line'}
                  key={`${line.timeMs}-${index}`}
                >
                  {line.text || '♪'}
                </div>
              ))}
            </div>
          ) : (
            <div className="fallback-line">
              <span>{statusText || headline}</span>
            </div>
          )}
        </div>

        <div className="bottom-bar">
          <span>{statusText || formatPlaybackStatus(media.status)}</span>
          <span>{formatTime(positionMs)} / {formatTime(media.durationMs)}</span>
        </div>

        {lastError ? <div className="error-line">{lastError}</div> : null}
        <div className="resize-handle" onPointerDown={startResize} />
      </section>
    </main>
  );
}

export default App;
