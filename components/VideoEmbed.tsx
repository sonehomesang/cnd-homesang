import { Image, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { type LearnClip, embedSrc } from '@/lib/learnClips';

/**
 * Plays a learn clip. On web: YouTube/Facebook via <iframe>, uploaded files via
 * <video>. On native: a tappable poster that opens the link in the platform
 * app/browser (avoids pulling in a native video/webview dependency for the MVP).
 */
export default function VideoEmbed({ clip, style }: { clip: LearnClip; style?: any }) {
  if (Platform.OS === 'web') {
    const src = embedSrc(clip);
    if (clip.videoType === 'upload') {
      const Video: any = 'video';
      return (
        <View style={[styles.box, style]}>
          <Video src={src} controls poster={clip.thumbnail} style={webMedia} />
        </View>
      );
    }
    const Iframe: any = 'iframe';
    return (
      <View style={[styles.box, style]}>
        <Iframe
          src={src}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          frameBorder={0}
          style={webMedia}
        />
      </View>
    );
  }
  // native fallback
  return (
    <Pressable style={[styles.box, style]} onPress={() => Linking.openURL(clip.videoUrl)}>
      {clip.thumbnail ? (
        <Image source={{ uri: clip.thumbnail }} style={StyleSheet.absoluteFill} />
      ) : null}
      <View style={styles.playWrap}><Text style={styles.play}>▶</Text></View>
    </Pressable>
  );
}

const webMedia: any = { width: '100%', height: '100%', border: 0, borderRadius: 12, backgroundColor: '#000', objectFit: 'contain' };

const styles = StyleSheet.create({
  box: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#0f172a', borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  playWrap: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center' },
  play: { fontSize: 22, color: '#0066CC', marginLeft: 3 },
});
