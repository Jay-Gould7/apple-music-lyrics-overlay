import OpenCC from 'opencc-js';

export type ScriptMode = 'original' | 'simplified' | 'traditional';

const toSimplified = OpenCC.Converter({ from: 'tw', to: 'cn' });
const toTraditional = OpenCC.Converter({ from: 'cn', to: 'tw' });

export function convertChineseScript(value: string, mode: ScriptMode): string {
  if (mode === 'simplified') {
    return toSimplified(value);
  }

  if (mode === 'traditional') {
    return toTraditional(value);
  }

  return value;
}
