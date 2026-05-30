import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

const client = new BedrockRuntimeClient({
  region: process.env.AWS_REGION ?? "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

// Claude 4 on AWS Bedrock (us inference profiles)
const MODEL_ID = "us.anthropic.claude-sonnet-4-5-20250929-v1:0";       // quality tasks
const MODEL_ID_FAST = "us.anthropic.claude-haiku-4-5-20251001-v1:0";   // fast classification

export interface BedrockMessage {
  role: "user" | "assistant";
  content: string;
}

export async function invokeClaude(
  messages: BedrockMessage[],
  systemPrompt: string,
  options: { fast?: boolean; jsonMode?: boolean; maxTokens?: number } = {}
): Promise<string> {
  const modelId = options.fast ? MODEL_ID_FAST : MODEL_ID;

  const body = {
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: options.maxTokens ?? 2048,
    system: systemPrompt,
    messages,
  };

  const command = new InvokeModelCommand({
    modelId,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify(body),
  });

  const response = await client.send(command);
  const decoded = JSON.parse(new TextDecoder().decode(response.body));
  const text = decoded.content?.[0]?.text ?? "";

  if (options.jsonMode) {
    // Extract JSON from the response
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return match[0];
  }

  return text;
}

// Convenience wrapper — single user message
export async function askClaude(
  userMessage: string,
  systemPrompt: string,
  options?: { fast?: boolean; jsonMode?: boolean; maxTokens?: number }
): Promise<string> {
  return invokeClaude([{ role: "user", content: userMessage }], systemPrompt, options);
}
