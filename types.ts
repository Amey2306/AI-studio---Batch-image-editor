export const AspectRatios = [
  "1:1",
  "16:9",
  "9:16",
  "4:3",
  "3:4",
] as const;

export type AspectRatio = typeof AspectRatios[number];

export interface UploadedImage {
  file: File;
  base64: string;
}
