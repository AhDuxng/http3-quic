import type { ComponentType } from "react";
import { FaFilm, FaLeaf, FaRocket } from "react-icons/fa";

export type ViewMode = 1 | 2 | 3;
export type SegmentSeconds = 1 | 2 | 4 | 6;
export type VideoId = "bigBuckBunny" | "ofForestAndMen" | "tearsOfSteel";

export interface VideoCatalogItem {
  id: VideoId;
  title: string;
  shortTitle: string;
  directory: string;
  filePrefix: string;
  accentClass: string;
  icon: ComponentType<{ className?: string }>;
}

export const viewModes: ViewMode[] = [1, 2, 3];

export const segmentOptions: SegmentSeconds[] = [1, 2, 4, 6];

export const videoCatalog: VideoCatalogItem[] = [
  {
    id: "bigBuckBunny",
    title: "Big Buck Bunny",
    shortTitle: "Bunny",
    directory: "BigBuckBunny",
    filePrefix: "BigBuckBunny",
    accentClass: "text-amber-500",
    icon: FaFilm,
  },
  {
    id: "ofForestAndMen",
    title: "Of Forest And Men",
    shortTitle: "Forest",
    directory: "OfForestAndMen",
    filePrefix: "OfForestAndMen",
    accentClass: "text-emerald-500",
    icon: FaLeaf,
  },
  {
    id: "tearsOfSteel",
    title: "Tears Of Steel",
    shortTitle: "Steel",
    directory: "TearsOfSteel",
    filePrefix: "TearsOfSteel",
    accentClass: "text-sky-500",
    icon: FaRocket,
  },
];

export function buildManifestUrl(video: VideoCatalogItem, segmentSeconds: SegmentSeconds) {
  return `/video/${video.directory}/${segmentSeconds}sec/${video.filePrefix}_${segmentSeconds}s_simple_2014_05_09.mpd`;
}
