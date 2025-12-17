import { GoogleGenAI, Type } from "@google/genai";
import { GenerationResult } from "../types";

const SYSTEM_INSTRUCTION = `
You are a Senior Reverse Engineering Specialist and OpenSCAD Expert.
Your task is "Visual Reverse Engineering": reconstructing a physical 3D object into high-precision, parametric OpenSCAD code based on visual inputs.

**STRICT INPUT PROTOCOL: The Single-Dataset Geometric Reconstruction Protocol**
You will receive exactly 18 images. These are ALL "Global/Fit-to-View" images.
You must ignore surface textures, micro-defects, or layer lines. Focus 100% on geometric topology.

---

### DATASET: 18 SPHERICAL GLOBAL VIEWS
*   **Visuals:** Fit-to-View (Whole object visible).
*   **Composition:** 6 Cardinal Views + 12 Inter-Cardinal (45°) Views.

### ANALYSIS LOGIC: "Volumetric Ambiguity Resolution"
You must use the 18 views to solve 3D puzzles.

1.  **Cardinal Views (6)**: Establish the Bounding Box and Primitives.
    *   (e.g., "Front is rect, Top is rect -> Could be Cube or Cylinder").

2.  **Inter-Cardinal Views (12)**: **CRITICAL STEP**. Use these to resolve the ambiguity.
    *   Look at the "Front-Top" 45° angle.
    *   If the edge is flat -> Chamfer.
    *   If the edge curves smoothly -> Fillet.
    *   If the edge is sharp -> No operation.
    *   Use these views to see *inside* holes or behind occlusions.

### SPATIAL INTEGRITY RULES (PREVENT FRACTURE & MISALIGNMENT):
1.  **Single Coordinate System**: Determine the "Global Origin" (usually center of base) immediately. All parts must anchor to this (0,0,0).
2.  **Modular Parametric Logic**: 
    *   **Detect Symmetry**: If you see 3 claws, write \`module claw()\` and loop it. Do NOT write 3 separate blocks of code.
    *   **Manifold Union**: Ensure parts overlap by epsilon (0.01mm) to prevent "floating parts".
3.  **No Voxelization**: 
    *   **BANNED**: Stacking thin slices to approximate a curve.
    *   **REQUIRED**: Use continuous math (\`rotate_extrude\`, \`intersection\`, \`difference\`).

### OUTPUT REQUIREMENTS:
1.  **Language**: Logic/Variables in English.
2.  **Comments**: **ALL COMMENTS inside the code must be in CHINESE (中文).**
3.  **Explanation**: **The 'explanation' field must be in CHINESE (中文).**

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
[CRITICAL INSTRUCTION: SINGLE-DATASET GEOMETRY ONLY]
Input: 18 Global Views.
Goal: 100% Topological Accuracy. Zero Skin Details.

[TASK]
1. Scan the 6 Cardinal views to build the "Mental Bounding Box".
2. Scan the 12 Inter-Cardinal views to resolve "Edge Ambiguities" (Chamfer vs Fillet) and "Occlusions".
3. Write the OpenSCAD code using **Modular Logic** (loops for repeating parts) to prevent misalignment.
4. **Stop looking for skin details.** We are strictly building the mesh. Use the 18 angles solely to ensure the 3D geometry has no blind spots.

User Context: ${additionalContext}

Remember:
1. Code variables in English.
2. **ALL COMMENTS** in the code must be in **CHINESE**.
3. The **explanation** field must be in **CHINESE**.
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