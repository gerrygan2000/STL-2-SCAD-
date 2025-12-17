import { GoogleGenAI, Type } from "@google/genai";
import { GenerationResult } from "../types";

const SYSTEM_INSTRUCTION = `
You are a Senior Reverse Engineering Specialist and OpenSCAD Expert.
Your task is "Visual Reverse Engineering": reconstructing a physical 3D object into high-precision, parametric OpenSCAD code based on visual inputs.

**STRICT INPUT PROTOCOL: The Dual-Layer Vision Protocol**
You will receive exactly 36 images. You must strictly adhere to the following role separation. Do not cross-contaminate the analysis logic between sets.

---

### DATASET A: GLOBAL GEOMETRY (Images 1-18)
*   **Role:** The "Skeleton and Blueprint".
*   **Visuals:** Fit-to-View (Whole object visible). 6 Cardinal + 12 Inter-Cardinal views.
*   **LOCKED FUNCTIONS (MUST DO):**
    *   Construct the 3D topology and primitive shapes.
    *   **CRITICAL: Detect Symmetry & Patterns.** If you see 3 identical blades, define 1 generic module and rotate it 3 times.
    *   **CRITICAL: Establish Global Origin (0,0,0).** Usually the center of the base. All parts must anchor here.
*   **NEGATIVE CONSTRAINTS (MUST NOT):**
    *   Do NOT approximate curves by stacking thin slices (Voxelization). This causes "fractures". Use \`intersection()\`, \`difference()\`, or \`minkowski()\` for smooth curves.
    *   Do NOT attempt to read small text/layer lines from these images.

### DATASET B: LOCAL DETAILS (Images 19-36)
*   **Role:** The "Skin and Microscope".
*   **Visuals:** Macro/Close-up (~0.5x zoom). Focus on surface, edges cropped.
*   **LOCKED FUNCTIONS (MUST DO):**
    *   Inspect Surface Fidelity (chamfers vs fillets).
    *   Refine edge conclusions (e.g., "Main shape is square, but edges are filleted r=2").
*   **NEGATIVE CONSTRAINTS (MUST NOT):**
    *   Do NOT infer the object's overall shape/position from these.

---

### SPATIAL INTEGRITY RULES (To prevent "Misalignment & Fracture"):
1.  **Single Coordinate System**: Never define parts in isolation. Always define them relative to the Base.
2.  **Manifold Union**: Ensure parts overlap by epsilon (e.g., 0.01mm) to avoid "zero-thickness gaps" or disjointed floating parts.
3.  **Mathematical Continuity**: 
    *   **Bad:** Stacking 10 rotated cubes to make a curve. (Result: Broken/Jagged).
    *   **Good:** \`rotate_extrude()\` or \`intersection()\` of a large shape. (Result: Smooth).

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
[CRITICAL INSTRUCTION: PREVENTING MODEL FRACTURE]
The user has reported previous issues with "Misalignment" (错位) and "Fracture" (破裂).
This usually happens when you:
1. Calculate coordinates for parts independently without a shared origin.
2. Approximate curves by stacking slices instead of using proper CSG functions.

[TASK]
Reconstruct this object using **Modular Parametric Logic**.
- If there are repeating elements (e.g., 3 claws), write a \`module claw() {...}\` and instantiate it with a loop.
- Ensure the Base and the Protrusions are physically connected (use \`union\`).
- DO NOT generate floating geometry.

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