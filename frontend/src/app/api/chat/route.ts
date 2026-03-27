import { NextRequest, NextResponse } from "next/server";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText, convertToModelMessages } from "ai";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages, apiKey, baseUrl, modelName, systemPrompt } = body as {
      messages: any[];
      apiKey: string;
      baseUrl: string;
      modelName: string;
      systemPrompt?: string;
    };

    if (!apiKey) {
      return NextResponse.json({ error: "API key is required" }, { status: 400 });
    }
    if (!modelName) {
      return NextResponse.json({ error: "Model name is required" }, { status: 400 });
    }

    const cleanBaseUrl = (baseUrl || "").replace(/\/$/, "") || "https://api.openai.com/v1";

    const openai = createOpenAI({
      baseURL: cleanBaseUrl,
      apiKey: apiKey,
    });

    console.log("=== Calling LLM via AI SDK ===");
    console.log("baseURL:", cleanBaseUrl);
    console.log("model:", modelName);
    console.log("systemPrompt:", systemPrompt || "(none)");

    const coreMessages = await convertToModelMessages(messages);

    const result = streamText({
      model: openai.chat(modelName),
      messages: coreMessages,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      onError: ({ error }) => {
        console.error("【LLM Upstream Error】:", error);
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error("=== Chat API Fatal Error ===");
    console.error(error);
    return NextResponse.json(
      {
        error: "Failed to process request",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
