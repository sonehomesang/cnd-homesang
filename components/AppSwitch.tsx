import { Switch, type SwitchProps } from 'react-native';

/** App-wide on/off switch: ON = green, OFF = gray. Use everywhere instead of Switch. */
export default function AppSwitch(props: SwitchProps) {
  return (
    <Switch
      trackColor={{ false: '#cbd5e1', true: '#16a34a' }}
      thumbColor="#ffffff"
      ios_backgroundColor="#cbd5e1"
      {...props}
    />
  );
}
