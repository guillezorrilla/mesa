/** What the app asks of the OS itself, apart from mesa: native dialogs. A seam like the bridge. */
export type Platform = {
  /** A folder the user picks, or null when they cancel. */
  pickFolder: () => Promise<string | null>;
};
