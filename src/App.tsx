import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { fetchLyrics, findActiveLineIndex, getLyricsKey } from './lyrics';
import { getMediaState, onClickThroughChanged, onSettingsPanelToggle, setClickThrough, setWindowSize, skipMedia } from './desktop';
import { convertChineseScript, type ScriptMode } from './chinese';
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

const DEFAULT_SETTINGS = {
  activeColor: '#fff6a6',
  inactiveColor: 'rgba(255, 255, 255, 0.34)',
  fontSize: 23,
  fontFamily: 'Inter, "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
  scriptMode: 'original' as ScriptMode,
  lyricOffsetMs: 650,
  windowWidth: 980,
  windowHeight: 180,
};
const POSITION_REWIND_TOLERANCE_MS = 1_500;
const FONT_OPTIONS = [
  { label: '系统默认', value: 'Inter, "Segoe UI", "Microsoft JhengHei UI", "Microsoft YaHei UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif' },
  { label: '微软雅黑', value: '"Microsoft YaHei", "微软雅黑", "Microsoft JhengHei", "微軟正黑體", sans-serif' },
  { label: '黑体', value: 'SimHei, "黑体", "Microsoft JhengHei", "微軟正黑體", sans-serif' },
  { label: '等线', value: 'DengXian, "等线", "Microsoft JhengHei", "微軟正黑體", sans-serif' },
  { label: '宋体', value: 'SimSun, "宋体", PMingLiU, "新細明體", serif' },
  { label: '楷体', value: 'KaiTi, "楷体", DFKai-SB, "標楷體", serif' },
  { label: '隶书', value: 'LiSu, "隶书", "Microsoft JhengHei", "微軟正黑體", serif' },
  { label: '幼圆', value: 'YouYuan, "幼圆", "Microsoft JhengHei", "微軟正黑體", sans-serif' },
  { label: '华文行楷', value: 'STXingkai, "华文行楷", KaiTi, DFKai-SB, "標楷體", serif' },
  { label: '华文琥珀', value: 'STHupo, "华文琥珀", SimHei, "Microsoft JhengHei", "微軟正黑體", sans-serif' },
  { label: '华文彩云', value: 'STCaiyun, "华文彩云", SimHei, "Microsoft JhengHei", "微軟正黑體", sans-serif' },
  { label: '圆体', value: '"Yu Gothic UI", "Microsoft JhengHei UI", "Microsoft YaHei UI", "Microsoft JhengHei", "微軟正黑體", sans-serif' },
  { label: '霞鹜文楷', value: '"LXGW WenKai", KaiTi, DFKai-SB, "標楷體", serif' },
  { label: '思源黑体', value: '"Source Han Sans TC", "Noto Sans CJK TC", "Source Han Sans SC", "Noto Sans CJK SC", "Microsoft JhengHei", "Microsoft YaHei", sans-serif' },
  { label: '思源宋体', value: '"Source Han Serif TC", "Noto Serif CJK TC", "Source Han Serif SC", "Noto Serif CJK SC", PMingLiU, SimSun, serif' },
  { label: 'Comic', value: '"Comic Sans MS", "Comic Sans", YouYuan, "Microsoft JhengHei", "微軟正黑體", cursive' },
  { label: 'Arial', value: 'Arial, "Microsoft JhengHei", "微軟正黑體", sans-serif' },
  { label: 'Georgia', value: 'Georgia, PMingLiU, "新細明體", serif' },
  { label: 'Courier', value: '"Courier New", Consolas, "Microsoft JhengHei", "微軟正黑體", monospace' },
];
const SCRIPT_MODE_LABELS: Record<ScriptMode, string> = {
  original: '原',
  simplified: '简',
  traditional: '繁',
};
const SCRIPT_MODE_TITLES: Record<ScriptMode, string> = {
  original: '原文显示',
  simplified: '转为简体',
  traditional: '转为繁体',
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

function formatLyricOffset(ms: number): string {
  if (ms > 0) {
    return `提前 ${ms}ms`;
  }

  if (ms < 0) {
    return `延后 ${Math.abs(ms)}ms`;
  }

  return '同步';
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

function SkipPreviousIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M6 5v14" />
      <path d="m18 6-9 6 9 6V6Z" />
    </svg>
  );
}

function SkipNextIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M18 5v14" />
      <path d="m6 6 9 6-9 6V6Z" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      <path d="M12 14v2" />
    </svg>
  );
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
    return lyrics ? findActiveLineIndex(lyrics.lines, positionMs + settings.lyricOffsetMs) : -1;
  }, [lyrics, positionMs, settings.lyricOffsetMs]);

  const updateMedia = useCallback((nextMedia: MediaState) => {
    const currentMedia = mediaRef.current;
    const currentClock = clockRef.current;
    const isSameTrack = getLyricsKey(currentMedia.title, currentMedia.artist) === getLyricsKey(nextMedia.title, nextMedia.artist);
    const projectedPositionMs = currentClock.status === 'playing'
      ? currentClock.positionMs + performance.now() - currentClock.receivedAt
      : currentClock.positionMs;
    const isMinorPlaybackRewind = isSameTrack
      && nextMedia.status === 'playing'
      && currentClock.status === 'playing'
      && nextMedia.positionMs < projectedPositionMs
      && projectedPositionMs - nextMedia.positionMs <= POSITION_REWIND_TOLERANCE_MS;
    const stableMedia = isMinorPlaybackRewind
      ? { ...nextMedia, positionMs: projectedPositionMs }
      : nextMedia;

    setMedia(stableMedia);
    mediaRef.current = stableMedia;
    clockRef.current = {
      positionMs: stableMedia.positionMs,
      receivedAt: performance.now(),
      status: stableMedia.status,
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

  const toggleScriptMode = useCallback(() => {
    const nextModeByCurrent: Record<ScriptMode, ScriptMode> = {
      original: 'simplified',
      simplified: 'traditional',
      traditional: 'original',
    };

    updateSettings({ scriptMode: nextModeByCurrent[settings.scriptMode] });
  }, [settings.scriptMode, updateSettings]);

  const handleSkip = useCallback(async (direction: 'previous' | 'next') => {
    try {
      await skipMedia(direction);
      setLastError('');
    } catch (error) {
      setLastError(error instanceof Error ? error.message : 'Failed to control media.');
    }
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

    fetchLyrics(media.title, media.artist, media.durationMs)
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
  }, [media.artist, media.durationMs, media.title, trackKey]);

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
        '--lyric-font-family': settings.fontFamily,
      } as CSSProperties}
    >
      <section className="lyric-window" onDoubleClick={unlockInteraction}>
        <div className="track-overlay">
          <div className="track-title">{headline}</div>
          <div className="track-artist">{subline}</div>
        </div>

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
            <div className="setting-control font-setting">
              <span>字体</span>
              <select
                className="font-select"
                style={{ fontFamily: settings.fontFamily }}
                value={settings.fontFamily}
                onChange={(event) => updateSettings({ fontFamily: event.target.value })}
              >
                {FONT_OPTIONS.map((fontOption) => (
                  <option key={fontOption.value} style={{ fontFamily: fontOption.value }} value={fontOption.value}>
                    {fontOption.label}
                  </option>
                ))}
              </select>
            </div>
            <button
              aria-label={SCRIPT_MODE_TITLES[settings.scriptMode]}
              className="script-toggle-button"
              title={SCRIPT_MODE_TITLES[settings.scriptMode]}
              type="button"
              onClick={toggleScriptMode}
            >
              {SCRIPT_MODE_LABELS[settings.scriptMode]}
            </button>
            <label>
              {formatLyricOffset(settings.lyricOffsetMs)}
              <input
                min="-2000"
                max="2000"
                step="50"
                type="range"
                value={settings.lyricOffsetMs}
                onChange={(event) => updateSettings({ lyricOffsetMs: Number(event.target.value) })}
              />
            </label>
          </div>

          <button aria-label="锁定穿透" className="lock-button" title="锁定穿透" type="button" onClick={toggleClickThrough}>
            <LockIcon />
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
                  {convertChineseScript(line.text, settings.scriptMode) || '♪'}
                </div>
              ))}
            </div>
          ) : (
            <div className="fallback-line">
              <span>{convertChineseScript(statusText || headline, settings.scriptMode)}</span>
            </div>
          )}
        </div>

        <div className="transport-controls">
          <button
            aria-label="上一首"
            className="transport-button"
            type="button"
            onClick={() => handleSkip('previous')}
          >
            <SkipPreviousIcon />
          </button>
          <button
            aria-label="下一首"
            className="transport-button"
            type="button"
            onClick={() => handleSkip('next')}
          >
            <SkipNextIcon />
          </button>
        </div>

        <div className="bottom-bar">
          <span>{formatTime(positionMs)} / {formatTime(media.durationMs)}</span>
        </div>

        {lastError ? <div className="error-line">{lastError}</div> : null}
        <div className="resize-handle" onPointerDown={startResize} />
      </section>
    </main>
  );
}

export default App;
