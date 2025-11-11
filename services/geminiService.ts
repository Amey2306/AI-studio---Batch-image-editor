import { GoogleGenAI, Modality, Type } from "@google/genai";

if (!process.env.API_KEY) {
  console.warn("API_KEY environment variable is not set. App will not function correctly.");
}

const getAI = () => {
  if (!process.env.API_KEY) {
    throw new Error("API_KEY is not available.");
  }
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

const fileToGenerativePart = async (file: File) => {
  const base64EncodedDataPromise = new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
    reader.readAsDataURL(file);
  });
  return {
    inlineData: { data: await base64EncodedDataPromise, mimeType: file.type },
  };
};

export const generateImage = async (prompt: string, aspectRatio: string): Promise<string[]> => {
  const ai = getAI();
  const response = await ai.models.generateImages({
    model: 'imagen-4.0-generate-001',
    prompt,
    config: {
      numberOfImages: 2,
      outputMimeType: 'image/jpeg',
      aspectRatio: aspectRatio as "1:1" | "16:9" | "9:16" | "4:3" | "3:4",
    },
  });

  return response.generatedImages.map(img => `data:image/jpeg;base64,${img.image.imageBytes}`);
};

export interface TextWithBoundingBox {
    text: string;
    boundingBox: {
        x1: number;
        y1: number;
        x2: number;
        y2: number;
    }
}

export const extractTextWithBoundingBoxes = async (imageFile: File): Promise<TextWithBoundingBox[]> => {
    const ai = getAI();
    const imagePart = await fileToGenerativePart(imageFile);
    const prompt = `Perform detailed OCR on this image. For each distinct line or block of text, provide its content and its bounding box coordinates. The coordinates should be percentages of the image's total width and height, with the origin (0,0) at the top-left corner. Return the result as a valid JSON array of objects, where each object has a "text" key and a "boundingBox" key. The boundingBox object should have "x1", "y1", "x2", "y2" keys. Example: [{"text": "Hello World", "boundingBox": {"x1": 0.1, "y1": 0.15, "x2": 0.4, "y2": 0.2}}]`;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [{ text: prompt }, imagePart] },
        config: {
            responseMimeType: 'application/json',
            responseSchema: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        text: { type: Type.STRING },
                        boundingBox: {
                            type: Type.OBJECT,
                            properties: {
                                x1: { type: Type.NUMBER },
                                y1: { type: Type.NUMBER },
                                x2: { type: Type.NUMBER },
                                y2: { type: Type.NUMBER },
                            },
                            required: ["x1", "y1", "x2", "y2"],
                        }
                    },
                    required: ["text", "boundingBox"],
                }
            }
        }
    });

    try {
        const jsonText = response.text.trim();
        const result = JSON.parse(jsonText);
        // Add validation for the structure if needed
        return result as TextWithBoundingBox[];
    } catch (e) {
        console.error("Failed to parse JSON response from Gemini for OCR:", response.text, e);
        throw new Error("The AI could not extract text and location data in the expected format. Please try another image.");
    }
};

export const editImage = async (prompt: string, originalImageFile: File, maskedImageBase64?: string): Promise<string> => {
  const ai = getAI();
  const originalImagePart = await fileToGenerativePart(originalImageFile);
  
  // FIX: Explicitly type `parts` to allow a union of image and text parts, preventing a TypeScript error.
  const parts: ({ inlineData: { data: string; mimeType: string; } } | { text: string })[] = [originalImagePart];

  if (maskedImageBase64) {
      const maskedImagePart = {
          inlineData: {
              data: maskedImageBase64.split(',')[1],
              mimeType: originalImageFile.type,
          }
      };
      parts.push(maskedImagePart);
  }
  
  parts.push({ text: prompt });

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: { parts },
    config: {
      responseModalities: [Modality.IMAGE],
    },
  });
  
  for (const part of response.candidates?.[0]?.content?.parts ?? []) {
    if (part.inlineData) {
      const { data, mimeType } = part.inlineData;
      return `data:${mimeType};base64,${data}`;
    }
  }

  const blockReason = response.candidates?.[0]?.finishReason;
  if (blockReason && blockReason !== 'STOP') {
    throw new Error(`Image generation was blocked. Reason: ${blockReason}. Please try a different prompt.`);
  }

  throw new Error("No edited image found in the response. The model may not have been able to fulfill the request.");
};