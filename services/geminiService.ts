import { GoogleGenAI, Type } from "@google/genai";
import { ScriptScene, AgentLog, AgentRole } from "../types";

// Helper to get client safely
const getClient = async () => {
  let apiKey = process.env.API_KEY;
  
  // Attempt to retrieve from window.aistudio (Project IDX / AI Studio environment)
  if (!apiKey && typeof window !== 'undefined' && (window as any).aistudio) {
      apiKey = await (window as any).aistudio.getApiKey();
  }

  if (!apiKey) throw new Error("API Key not found");
  return new GoogleGenAI({ apiKey });
};

/**
 * PARSER AGENT: Converts raw markdown script into structured JSON scenes.
 */
export const parseScriptWithGemini = async (rawText: string): Promise<ScriptScene[]> => {
  const ai = await getClient();
  
  const prompt = `
    You are a Script Parsing Agent. 
    Analyze the following video script (which is a parody of Holmes on Homes).
    Break it down into individual visual scenes suitable for video generation.
    
    Extract:
    1. A short title.
    2. A highly descriptive 'visualPrompt' optimized for an AI Video Generator (Veo). Describe the lighting, camera angle, subject appearance, and action.
    3. The 'narrativeContext' (what is happening in the story).
    4. An 'imageUrl' if a link to an image is explicitly provided in the scene description (optional).

    Script:
    ${rawText}
  `;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            visualPrompt: { type: Type.STRING },
            narrativeContext: { type: Type.STRING },
            imageUrl: { type: Type.STRING, nullable: true }
          },
          required: ["title", "visualPrompt", "narrativeContext"]
        }
      }
    }
  });

  const parsed = JSON.parse(response.text || "[]");
  return parsed.map((item: any, index: number) => ({
    id: index + 1,
    ...item,
    status: 'IDLE'
  }));
};

/**
 * CONTINUITY AGENT: Analyzes if the next scene should extend the previous one.
 */
export const checkContinuity = async (
  currentScene: ScriptScene, 
  previousScene: ScriptScene | null
): Promise<{ shouldExtend: boolean; reasoning: string }> => {
  if (!previousScene) {
    return { shouldExtend: false, reasoning: "First scene, nothing to extend." };
  }

  const ai = await getClient();
  
  const prompt = `
    You are a Continuity QA Agent for video production.
    
    Previous Scene Context: "${previousScene.narrativeContext}"
    Previous Visual: "${previousScene.visualPrompt}"
    
    Current Scene Context: "${currentScene.narrativeContext}"
    Current Visual: "${currentScene.visualPrompt}"
    
    Determine if the Current Scene is a direct temporal continuation of the Previous Scene (meaning we should EXTEND the previous video clip) or if it is a new shot/cut.
    
    If it's a completely different angle, location, or time, do NOT extend.
    If it's the same continuous shot just moving forward in time, return true.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          shouldExtend: { type: Type.BOOLEAN },
          reasoning: { type: Type.STRING }
        },
        required: ["shouldExtend", "reasoning"]
      }
    }
  });

  return JSON.parse(response.text || '{"shouldExtend": false, "reasoning": "Parse error"}');
};

/**
 * STAGE HAND AGENT: Generates a starting frame using Gemini Flash Image (Nano Banana).
 */
export const generateStageHandImage = async (visualPrompt: string): Promise<string> => {
  const ai = await getClient();
  
  // Using nano banana series for image generation as requested
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [
        { text: `Generate a high quality, photorealistic, cinematic movie frame based on this description: ${visualPrompt}` },
      ],
    },
  });

  let base64Data = '';
  
  // Iterate to find image part
  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      base64Data = part.inlineData.data;
      break;
    }
  }

  if (!base64Data) {
    throw new Error("Stage Hand failed to generate an image.");
  }

  return base64Data;
};

/**
 * HELPER: Fetch image from URL and convert to Base64
 */
export const fetchImageAsBase64 = async (url: string): Promise<string> => {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    throw new Error(`Stage Hand could not retrieve reference image: ${error}`);
  }
};

/**
 * GENERATOR AGENT: Calls Veo to generate video.
 */
export const generateVeoVideo = async (
  scene: ScriptScene,
  previousSceneVideoHandle: any | undefined,
  shouldExtend: boolean,
  imageBase64: string | undefined, // New: Input image for Veo
  logCallback: (log: AgentLog) => void
): Promise<{ uri: string; handle: any }> => {
  const ai = await getClient();
  
  // Veo logic: 
  // - If extending: Must use 'veo-3.1-generate-preview' (720p).
  // - If image input: Can use fast or generate-preview. We'll use fast for speed unless extending.
  // - Note: You cannot usually extend AND provide a new reference image as the 'start' frame easily in one go 
  //   without advanced config, so we will prioritize extension logic if shouldExtend is true.
  
  const model = shouldExtend ? 'veo-3.1-generate-preview' : 'veo-3.1-fast-generate-preview';
  
  logCallback({
    id: crypto.randomUUID(),
    timestamp: new Date(),
    role: AgentRole.GENERATOR,
    status: 'thinking',
    message: `Initializing Veo task for Scene ${scene.id}... Model: ${model}`
  });

  let operation;

  try {
    if (shouldExtend && previousSceneVideoHandle) {
      logCallback({
        id: crypto.randomUUID(),
        timestamp: new Date(),
        role: AgentRole.GENERATOR,
        status: 'thinking',
        message: `Extending previous clip for continuity...`
      });

      operation = await ai.models.generateVideos({
        model: 'veo-3.1-generate-preview', 
        prompt: scene.visualPrompt,
        video: previousSceneVideoHandle,
        config: {
          numberOfVideos: 1,
          resolution: '720p',
          aspectRatio: '16:9'
        }
      });
    } else {
      // Standard generation (Text-to-Video OR Image-to-Video)
      const request: any = {
        model: 'veo-3.1-fast-generate-preview',
        prompt: scene.visualPrompt,
        config: {
          numberOfVideos: 1,
          resolution: '1080p',
          aspectRatio: '16:9'
        }
      };

      // Add image if available
      if (imageBase64) {
         logCallback({
            id: crypto.randomUUID(),
            timestamp: new Date(),
            role: AgentRole.GENERATOR,
            status: 'info',
            message: `Applying Stage Hand reference image to generation...`
          });
        request.image = {
          imageBytes: imageBase64,
          mimeType: 'image/png' // Assuming PNG from generation or generic valid type
        };
      }

      operation = await ai.models.generateVideos(request);
    }

    logCallback({
        id: crypto.randomUUID(),
        timestamp: new Date(),
        role: AgentRole.GENERATOR,
        status: 'thinking',
        message: `Task submitted to Google Cloud. Polling for completion... (This may take 1-2 minutes)`
    });

    // Polling loop
    while (!operation.done) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Poll every 5s
      operation = await ai.operations.getVideosOperation({ operation: operation });
    }

    if (operation.error) {
        throw new Error(operation.error.message || "Unknown Veo Error");
    }

    const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
    const videoHandle = operation.response?.generatedVideos?.[0]?.video;

    if (!videoUri) {
        throw new Error("No video URI returned from Veo");
    }

    return { uri: videoUri, handle: videoHandle };

  } catch (e: any) {
    throw new Error(e.message || "Failed to generate video");
  }
};