import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { checkMedList } from "@/lib/utils";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SYSTEM_PROMPT = `You are a medication identification assistant helping an elderly person confirm they are taking the correct pill. You may receive one or more photos of the same pill (e.g. front, back, side). Use all provided images together to make the most accurate identification possible. Return ONLY a JSON object with these fields:
- brand_name: brand name of the medication (or 'Unknown' if not identifiable)
- generic_name: generic/chemical name of the medication (or 'Unknown')
- strength: dosage strength visible or likely (e.g. '10mg') (or 'Unknown')
- purpose: what this medication is typically used for, in plain simple language a non-medical person would understand, 2 sentences max
- imprint: any text, numbers, or letters visible on the pill surface (combine imprints from all photos)
- color: color of the pill
- shape: shape of the pill
- confidence: your confidence level as 'high', 'medium', or 'low'
- notes: any important caveats, e.g. if the image is blurry or the pill is hard to identify

Always include both brand and generic names when known. For common generics, still provide the brand name equivalent. Return nothing except the JSON object.`;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const imageFiles = formData.getAll("images") as File[];

    if (imageFiles.length === 0) {
      return NextResponse.json({ error: "No images provided" }, { status: 400 });
    }

    // Convert all images to base64 content blocks
    const imageBlocks = await Promise.all(
      imageFiles.map(async (imageFile) => {
        const arrayBuffer = await imageFile.arrayBuffer();
        const base64Data = Buffer.from(arrayBuffer).toString("base64");
        const mediaType = (imageFile.type || "image/jpeg") as
          | "image/jpeg"
          | "image/png"
          | "image/gif"
          | "image/webp";
        return {
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: mediaType,
            data: base64Data,
          },
        };
      })
    );

    const photoLabel = imageBlocks.length === 1
      ? "Please identify this pill and return the JSON object as instructed."
      : `I am providing ${imageBlocks.length} photos of the same pill (front, back, and/or side views). Use all photos together to identify it and return the JSON object as instructed.`;

    // Call Claude vision API
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            ...imageBlocks,
            {
              type: "text",
              text: photoLabel,
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
