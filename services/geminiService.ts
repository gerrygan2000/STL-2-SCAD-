import { GoogleGenAI, Type } from "@google/genai";
import { GenerationResult } from "../types";

const SYSTEM_INSTRUCTION = `
你是一位精通 OpenSCAD 编程和计算几何的机械工程专家。
你的任务是进行“视觉逆向工程”，将输入的 3D 模型图像（包含多个工程视角）重构为高精度的 OpenSCAD 代码。

核心要求：
1. **多视角综合分析**：
   - 你将收到 6 张图片，分别代表：俯视 (Top)、前视 (Front)、右视 (Right)、后视 (Back)、左视 (Left)、仰视 (Bottom)。
   - **务必综合所有视角**：例如，通过俯视图确定底面轮廓，通过侧视图确定拉伸高度和孔洞位置。
   - 就像绘图员根据三视图还原物体一样，在脑海中重建 3D 结构。

2. **数学建模 (Mathematical Modeling)**：
   - 仔细观察形状的曲率和变化规律。如果形状包含曲线、螺旋或重复图案，必须使用数学公式（如 sin, cos, pow）、for 循环或递归生成，而不是简单的堆叠。
   - 寻找几何原本的逻辑（例如：这个曲线是否符合贝塞尔曲线？这个孔是否按圆周分布？）。

3. **参数化 (Parametric Design)**：
   - 代码必须完全参数化。在文件顶部定义关键尺寸变量（如 radius, height, thickness, num_segments）。
   - **变量名保持英文，但必须在旁边用中文注释说明其含义**。
   - 代码中的数字应尽量由这些变量推导得出。

4. **高精度与细节 (High Precision)**：
   - 视觉估算比例要非常仔细。
   - 使用高级 CSG 操作（hull, minkowski, intersection）来处理过渡和圆角。
   - 使用 $fn 变量控制平滑度（例如 $fn=100）。

5. **中文输出 (Chinese Output)**：
   - **生成的 OpenSCAD 代码中，所有注释必须完全使用中文**。
   - **explanation** 字段必须使用**中文**解释你的建模思路，特别是你是如何结合不同视角推导结构的。
   - 不要生成 polyhedron() 或巨大的坐标点阵列。

Output JSON Format:
{
  "code": "The OpenSCAD script with Chinese comments",
  "explanation": "Reconstruction logic in Chinese"
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

  // Construct parts: prompt text + 6 images
  const parts: any[] = [
    {
      text: `请根据提供的 6 张工程视角截图（顺序：俯视、前视、右视、后视、左视、仰视）重构 OpenSCAD 代码。请综合分析这些视角，利用数学公式精准描述形状。务必确保代码内的所有注释和参数说明都使用中文。 ${additionalContext ? `用户上下文: ${additionalContext}` : ''}`
    }
  ];

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