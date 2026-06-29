'use server';

import { getStorageConfig } from '@/lib/storageConfig';
import { shareLinkByPath } from '@/lib/mirror';

/** True when files are mirrored to OneDrive, so an "Open in OneDrive" action makes
 *  sense. Cheap — lets the button gate itself without prop-drilling a flag through
 *  every page/client. */
export async function onedriveEnabled(): Promise<boolean> {
  const s = await getStorageConfig();
  return s.backend === 'onedrive';
}

/** Anonymous view-only OneDrive link for a stored file, by its relative path. */
export async function getOnedriveShareLink(filePath: string): Promise<{ url?: string; error?: string }> {
  if (!filePath) return { error: 'No file' };
  const url = await shareLinkByPath(filePath);
  return url ? { url } : { error: 'Could not create a OneDrive link' };
}
