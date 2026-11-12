import { useState } from 'react';
import { Alert } from 'react-native';
import { type Photo, pickPhoto } from './pickPhoto';

/** The photo attached to a reply: picked and resized from the library, or none. */
export function usePhoto() {
  const [photo, setPhoto] = useState<Photo>();
  const attach = () =>
    pickPhoto().then(
      (picked) => picked && setPhoto(picked),
      (error: Error) => Alert.alert('Could not attach the photo', error.message),
    );
  return { photo, setPhoto, attach };
}
