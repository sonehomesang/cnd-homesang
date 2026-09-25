import { Platform } from 'react-native';
import { getDownloadURL, ref, uploadBytes, uploadBytesResumable } from 'firebase/storage';
import { storage } from './firebase';

const MAX_DIMENSION = 1280;
const JPEG_QUALITY = 0.7;

/**
 * Compress an image (web: Canvas) to a JPEG Blob with max dimension + quality.
 */
async function compressWeb(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  let { width, height } = bitmap;
  if (width > height && width > MAX_DIMENSION) {
    height = Math.round((height * MAX_DIMENSION) / width);
    width = MAX_DIMENSION;
  } else if (height > MAX_DIMENSION) {
    width = Math.round((width * MAX_DIMENSION) / height);
    height = MAX_DIMENSION;
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, width, height);
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob ?? file),
      'image/jpeg',
      JPEG_QUALITY,
    );
  });
}

/**
 * Upload a picked image to Firebase Storage with compression.
 * @param uri  local file URI (native) or blob/object URL (web)
 * @param path storage path, e.g. `jobs/<id>/photo1.jpg`
 * @returns download URL
 */
export async function uploadImage(uri: string, path: string): Promise<string> {
  let blob: Blob;

  if (Platform.OS === 'web') {
    const resp = await fetch(uri);
    const original = await resp.blob();
    blob = await compressWeb(original);
  } else {
    // Native: compress via expo-image-manipulator
    const ImageManipulator = await import('expo-image-manipulator');
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: MAX_DIMENSION } }],
      { compress: JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG },
    );
    const resp = await fetch(result.uri);
    blob = await resp.blob();
  }

  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' });
  return getDownloadURL(storageRef);
}

/**
 * Upload a picked video to Firebase Storage (no compression) with progress.
 * @param uri  local file URI (native) or blob/object URL (web)
 * @param path storage path, e.g. `learnClips/<id>.mp4`
 * @param onProgress optional 0-100 percent callback
 * @returns download URL
 */
export async function uploadVideo(
  uri: string,
  path: string,
  onProgress?: (pct: number) => void,
): Promise<string> {
  const resp = await fetch(uri);
  const blob = await resp.blob();
  const storageRef = ref(storage, path);
  const contentType = blob.type || 'video/mp4';
  await new Promise<void>((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, blob, { contentType });
    task.on(
      'state_changed',
      (s) => onProgress?.(Math.round((s.bytesTransferred / s.totalBytes) * 100)),
      reject,
      () => resolve(),
    );
  });
  return getDownloadURL(storageRef);
}

export function approxSizeKB(blob: Blob): number {
  return Math.round(blob.size / 1024);
}

/**
 * Upload any file (document/blob) to Firebase Storage, preserving its content
 * type — no compression. Returns the download URL + byte size + mime type.
 * @param uri  object/blob URL (web) or local file URI (native)
 */
export async function uploadFile(uri: string, path: string): Promise<{ url: string; size: number; type: string }> {
  const resp = await fetch(uri);
  const blob = await resp.blob();
  const storageRef = ref(storage, path);
  const type = blob.type || 'application/octet-stream';
  await uploadBytes(storageRef, blob, { contentType: type });
  const url = await getDownloadURL(storageRef);
  return { url, size: blob.size, type };
}
