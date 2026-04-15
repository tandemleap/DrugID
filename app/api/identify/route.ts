import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { checkMedList } from "@/lib/utils";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SYSTEM_PROMPT = `You are a medication identification assistant helping an elderly person confirm they are taking the correct pill. Analyze the pill in the photo carefully. Return ONLY a JSON object with these fields:
- brand_name: brand name of the medication (or 'Unknown' if not identifiable)
- generic_name: generic/chemical name of the medication (or 'Unknown')
- strength: dosage strength visible or likely (e.g. '10mg') (or 'Unknown')
- purpose: what this medication is typically used for, in plain simple language a non-medical person would understand, 2 sentences max
- imprint: any text, numbers, or letters visible on the pill surface
- color: color of the pill
- shape: shape of the pill
- confidence: your confidence level as 'high', 'medium', or 'low'
- notes: any important caveats, e.g. if the image is blurry or the pill is hard to identify

Always include both brand and generic names when known. For common generics, still provide the brand name equivalent. Return nothing except the JSON object.`;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const imageFile = formData.get("image") as File | null;

    if (!imageFile) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    // Convert file to base64
    const arrayBuffer = await imageFile.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString("base64");

    // Determine media type
    const mediaType = (imageFile.type || "image/jpeg") as
      | "image/jpeg"
      | "image/png"
      | "image/gif"
      | "image/webp";

    // Call Claude vision API
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType,
                data: base64Data,
              },
            },
            {
              type: "text",
              text: "Please identify this pill and return the JSON object as instructed.",
            },
          ],
        },
      ],
    });

    // Parse Claude's response
    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("No text response from Claude");
    }

    // Strip any markdown code fences if present
    let jsonText = textBlock.text.trim();
    jsonText = jsonText.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();

    let pillData: Record<string, string>;
    try {
      pillData = JSON.parse(jsonText);
    } catch {
      throw new Error("Could not parse pill identification response");
    }

    // Check medication list
    const medMatch = checkMedList(
      pillData.brand_name || "Unknown",
      pillData.generic_name || "Unknown"
    );

    // Background: enrich with openFDA (fail silently)
    let fdaData: Record<string, string> | null = null;
    if (
      pillData.generic_name &&
      pillData.generic_name.toLowerCase() !== "unknown"
    ) {
      try {
        const fdaUrl = `https://api.fda.gov/drug/ndc.json?search=generic_name:%22${encodeURIComponent(pillData.generic_name)}%22&limit=1`;
        const fdaResponse = await fetch(fdaUrl, {
          signal: AbortSignal.timeout(5000),
        });
        if (fdaResponse.ok) {
          const fdaJson = await fdaResponse.json();
          if (fdaJson.results && fdaJson.results.length > 0) {
            const result = fdaJson.results[0];
            fdaData = {
              brand_name: result.brand_name || "",
              generic_name: result.generic_name || "",
              dosage_form: result.dosage_form || "",
              strength: result.active_ingredients?.[0]?.strength || "",
            };
          }
        }
      } catch {
        // Fail silently — FDA enrichment is best-effort
      }
    }

    return NextResponse.json({
      pill: pillData,
      medMatch,
      fdaData,
    });
  } catch (error) {
    console.error("Identify API error:", error);
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
