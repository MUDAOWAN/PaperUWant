import { NextRequest, NextResponse } from "next/server";
import { createUIMessageStreamResponse } from "ai";

export async function POST(req: NextRequest) {
  console.log("=== API Received ===");

  try {
    const body = await req.json();
    console.log("Body keys:", Object.keys(body));

    // Extract dynamic config from request body
    const {
      apiKey: bodyApiKey,
      baseUrl: bodyBaseUrl,
      model: bodyModel,
      systemPrompt: bodySystemPrompt,
    } = body;

    // Use dynamic keys if provided, otherwise fall back to env
    const apiKey = bodyApiKey || process.env.MINIMAX_API_KEY;
    const baseURL = bodyBaseUrl || process.env.MINIMAX_BASE_URL || "https://api.minimax.chat/v1";
    const model = bodyModel || "MiniMax-M2.7";

    if (!apiKey) {
      return NextResponse.json({ error: "API key is required" }, { status: 400 });
    }

    // Transform messages from AI SDK v6 format (parts) to standard format (content)
    const messages: any[] = (body.messages || []).map((msg: any) => {
      if (msg.parts && Array.isArray(msg.parts)) {
        const textPart = msg.parts.find((p: any) => p.type === 'text');
        return {
          role: msg.role,
          content: textPart?.text || '',
        };
      }
      return {
        role: msg.role,
        content: typeof msg.content === 'string' ? msg.content : '',
      };
    });

    // Inject system prompt as first message if provided
    if (bodySystemPrompt && messages.length > 0 && messages[0].role !== 'system') {
      messages.unshift({ role: 'system', content: bodySystemPrompt });
    }

    console.log("Transformed messages count:", messages.length);
    console.log("=== Calling MiniMax API ===");
    console.log("Using baseURL:", baseURL);
    console.log("Using model:", model);

    const response = await fetch(`${baseURL}/text/chatcompletion_v2`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
      }),
    });

    console.log("=== MiniMax Response Status:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("MiniMax API error:", response.status, errorText);
      return NextResponse.json(
        { error: "MiniMax API error", details: errorText },
        { status: response.status }
      );
    }

    // Transform MiniMax's chat.completion.chunk SSE to AI SDK's UI message stream format
    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        // Send start events
        controller.enqueue({ type: "start" });
        controller.enqueue({ type: "start-step" });
        controller.enqueue({ type: "text-start", id: "text-1" });

        let fullContent = "";

        try {
          while (true) {
            const { done, value } = await reader!.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const data = line.slice(6);
                if (data === "[DONE]") continue;

                try {
                  const parsed = JSON.parse(data);
                  const content = parsed.choices?.[0]?.delta?.content;
                  if (content) {
                    fullContent += content;
                    controller.enqueue({ type: "text-delta", id: "text-1", delta: content });
                  }
                } catch (e) {
                  // Skip invalid JSON
                }
              }
            }
          }
        } catch (e) {
          controller.enqueue({ type: "error", errorText: String(e) });
        }

        // Send finish events
        controller.enqueue({ type: "text-end", id: "text-1" });
        controller.enqueue({ type: "finish-step" });
        controller.enqueue({ type: "finish" });

        console.log("=== Stream complete, total content length:", fullContent.length);
        controller.close();
      }
    });

    console.log("=== Returning transformed stream ===");

    return createUIMessageStreamResponse({ stream });
  } catch (error) {
    console.error("=== Chat API Fatal Error ===");
    console.error(error);
    return NextResponse.json({
      error: "Failed to process request",
      details: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}