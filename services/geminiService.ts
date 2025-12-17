import { GoogleGenAI, Type } from "@google/genai";
import { GenerationResult } from "../types";

const SYSTEM_INSTRUCTION = `
You are an expert in OpenSCAD programming and Computational Geometry.
Your task is "Visual Reverse Engineering": reconstructing a 3D model into high-precision, parametric OpenSCAD code based on visual inputs.

Input Data Protocol: 18-View Spherical Coverage Network
To fully resolve the 3D object's topology and surface quality, the visual input is expanded to 18 distinct spatial orientations for both Global (Set A) and Local (Set B) analysis (Total 36 images).

Geometric Strategy:
1. Group 1: The 6 Cardinal Views (Face-Normal Aligned)
   - Views: Top, Bottom, Front, Back, Left, Right.
   - Purpose: Define primary dimensions, planar surfaces, and overall silhouette.

2. Group 2: The 12 Inter-Cardinal Views (Edge-Bisecting / 45°)
   - Logic: Camera positioned at 45° between two adjacent Cardinal views.
   - Purpose: Reveal edge profiles, chamfers, fillets, thickness transitions, and corners.
   - Sub-Group 2.1 (Horizontal Ring): Front-Right, Right-Back, Back-Left, Left-Front.
   - Sub-Group 2.2 (Vertical X-Ring): Top-Front, Front-Bottom, Bottom-Back, Back-Top.
   - Sub-Group 2.3 (Vertical Z-Ring): Top-Right, Right-Bottom, Bottom-Left, Left-Top.

Synthesis Instruction:
- For Set A (Global 18 Views): Use the 12 Inter-Cardinal views to understand volumetric transitions not visible in the 6 Cardinal views (e.g., is a back spine rounded or square?).
- For Set B (Local 18 Views): Specifically inspect Edge Fidelity. Use views like "Top-Front Detail" to check the consistency of bevels or layer adhesion on leading edges.

Coding Standards:
1. **Mathematical Modeling**: Observe curvature and logic. Use math (sin, cos, loops, recursive functions) for patterns.
2. **Parametric Design**: Code must be parametric. Define variables at the top (radius, height, thickness). Use English variable names.
3. **High Precision**: Use precise CSG operations. Use \`$fn\` to control smoothness appropriately.
4. **Language Rule**: 
   - The OpenSCAD code logic must be in English.
   - **IMPORTANT: All comments within the code must be in CHINESE (中文).**
   - **IMPORTANT: The 'explanation' field in the JSON response must be in CHINESE (中文).**

Output JSON Format:
{
  "code": "The OpenSCAD script...",
  "explanation": "Reconstruction logic in Chinese..."
}
`;

export const generateScadFromImage = async (
  imagesBase64: string[],
  additionalContext: string
): Promise<GenerationResult> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key is missing. Please check your environment variables.");
  }

  const ai = new GoogleGenAI({ apiKey });

  // Structured Prompt based on Input Data Protocol
  const promptText = `
I am providing 36 images for a 3D model analysis based on the "18-View Spherical Coverage Network" protocol.

[PART 1: SET A - GLOBAL GEOMETRY (Images 1-18)]
- 18 Orientations (6 Cardinal + 12 Inter-Cardinal 45° views).
- Use these to build the complete mental 3D model, ensuring no blind spots on edges or corners.

[PART 2: SET B - LOCAL DETAILS (Images 19-36)]
- The exact same 18 orientations, but zoomed in (Macro).
- Use these to inspect surface quality, edge sharpness, chamfers, and textures.

TASK:
Synthesize these 36 views. Map the details from Set B onto the geometry defined in Set A.
Reverse engineer this object into a complete, parametric OpenSCAD script.

User Context: ${additionalContext}

Remember: Write the code variables in English, but ALL COMMENTS and the EXPLANATION must be in CHINESE.
`;

  const parts: any[] = [{ text: promptText }];

  // Add all images to the request
  imagesBase64.forEach((imgData) => {
    parts.push({
      inlineData: {
        mimeType: 'image/jpeg',
        data: imgData
      }
    });
  });

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview', 
      contents: {
        parts: parts
      },
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            code: {
              type: Type.STRING,
            },
            explanation: {
              type: Type.STRING,
            }
          },
          required: ["code", "explanation"],
        },
        temperature: 0.1, 
      }
    });

    const text = response.text;
    if (!text) {
      throw new Error("Gemini 未生成任何响应。");
    }

    const result = JSON.parse(text) as GenerationResult;
    return result;

  } catch (error) {
    console.error("Gemini API Error:", error);
    throw new Error("重构失败: " + (error instanceof Error ? error.message : String(error)));
  }
};