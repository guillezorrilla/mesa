import { IMAGE_MAX } from '@mesa/core/phone';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { launchImageLibraryAsync } from 'expo-image-picker';

/** A photo or screenshot ready to send: its local uri to show, and its JPEG as base64. */
export type Photo = { uri: string; base64: string };

/** The longest side a photo keeps, and its JPEG quality: an agent reads it, a few hundred KB. */
const LONGEST = 1600;
const QUALITY = 0.6;

/**
 * A photo the person picks, decoded at most LONGEST on a side and saved as JPEG, so it seals and
 * chunks under the request's limit; none when they cancel.
 */
export async function pickPhoto(): Promise<Photo | undefined> {
  const picked = await launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  const asset = picked.canceled ? undefined : picked.assets[0];
  if (!asset) return undefined;
  const image = await ImageManipulator.manipulate(asset.uri, {
    maxWidth: LONGEST,
    maxHeight: LONGEST,
  }).renderAsync();
  const saved = await image.saveAsync({ base64: true, compress: QUALITY, format: SaveFormat.JPEG });
  if (!saved.base64 || saved.base64.length > IMAGE_MAX)
    throw new Error('That photo is too large to send; try a screenshot or a smaller one.');
  return { uri: saved.uri, base64: saved.base64 };
}
