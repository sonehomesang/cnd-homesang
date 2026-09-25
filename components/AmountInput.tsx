import { useEffect, useState } from 'react';
import { TextInput, type TextInputProps } from 'react-native';
import { groupThousands, parseNumeric, sanitizeNumeric } from '@/lib/format';

type Props = Omit<TextInputProps, 'value' | 'onChangeText' | 'keyboardType'> & {
  value: number;
  onChangeValue: (n: number) => void;
  decimals?: boolean; // allow a decimal part (e.g. percentages)
};

/** A TextInput that shows 1,000-separators live while typing and emits a clean
 * number. Keeps a local raw string so a trailing "." (mid-typing a decimal) or
 * a leading-zero decimal isn't clobbered; re-syncs if the value changes from
 * outside (form reset, programmatic set). */
export default function AmountInput({ value, onChangeValue, decimals, ...rest }: Props) {
  const [raw, setRaw] = useState<string | null>(null); // null → derive from value

  // adopt an externally-changed value that no longer matches our local text
  useEffect(() => {
    if (raw !== null && parseNumeric(raw) !== value) setRaw(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const display = raw !== null ? groupThousands(raw) : value ? groupThousands(String(value)) : '';

  const handle = (s: string) => {
    const d = sanitizeNumeric(s, decimals);
    setRaw(d);
    onChangeValue(parseNumeric(d));
  };

  return (
    <TextInput
      value={display}
      onChangeText={handle}
      onBlur={(e) => { setRaw(null); rest.onBlur?.(e); }}
      keyboardType={decimals ? 'decimal-pad' : 'number-pad'}
      {...rest}
    />
  );
}
