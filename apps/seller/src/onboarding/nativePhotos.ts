// The native side of photos (expo-image-picker, expo-image-manipulator, fetch): plugged
// into the tested logic in photos.ts.
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { uploadsApi } from './api';
import type { Picked, PhotoDeps } from './photos';

export const nativePhotoDeps: PhotoDeps = {
  async encode(uri, width, quality) {
    // Always a fresh JPEG: re-encoding drops EXIF and GPS (decision #52).
    const rendered = await ImageManipulator.manipulate(uri).resize({ width }).renderAsync();
    const saved = await rendered.saveAsync({ compress: quality, format: SaveFormat.JPEG });
    return { uri: saved.uri, width: saved.width, height: saved.height };
  },
  async readFile(uri) {
    return (await fetch(uri)).blob();
  },
  requestUpload: (body) => uploadsApi.request(body),
  async put(upload, file) {
    const res = await fetch(upload.url, {
      method: upload.method,
      headers: upload.headers,
      body: file,
    });
    return res.ok;
  },
};

export type PickSource = 'camera' | 'library';

/**
 * Opens the camera or the gallery. Returns the picked photos (none when cancelled), or an
 * error message when permission was refused.
 */
export async function pickPhotos(
  source: PickSource,
  max: number,
): Promise<{ photos: Picked[]; error: string | null }> {
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    quality: 1,
    exif: false, // never read metadata into the app
    allowsMultipleSelection: source === 'library' && max > 1,
    selectionLimit: max,
  };
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      return {
        photos: [],
        error: 'Allow oda to use the camera in your phone settings, or choose from the gallery.',
      };
    }
  }
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled) return { photos: [], error: null };
  return {
    photos: result.assets
      .slice(0, max)
      .map((a) => ({ uri: a.uri, width: a.width, height: a.height })),
    error: null,
  };
}
