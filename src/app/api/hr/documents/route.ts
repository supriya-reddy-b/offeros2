import { NextRequest, NextResponse } from "next/server";
import { getCommonDocuments, uploadCommonFile, deleteFile } from "@/lib/box";
import { convertDocxToPdf } from "@/lib/docx-convert";

export async function GET() {
  try {
    const documents = await getCommonDocuments();
    return NextResponse.json(documents);
  } catch (error) {
    console.error("Box fetch error:", error);
    return NextResponse.json([], { status: 200 });
  }
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const files = formData.getAll("file") as File[];

  if (!files || files.length === 0) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }

  const results = [];

  for (const file of files) {
    try {
      let buffer = Buffer.from(await file.arrayBuffer()) as Buffer;
      let fileName = file.name;

      if (/\.docx?$/i.test(fileName)) {
        const converted = await convertDocxToPdf(buffer, fileName);
        buffer = converted.buffer;
        fileName = converted.name;
      }

      const uploaded = await uploadCommonFile(fileName, buffer);
      results.push(uploaded);
    } catch (error) {
      console.error(`Upload error for ${file.name}:`, error);
    }
  }

  return NextResponse.json(results, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const { fileId } = await request.json();
  await deleteFile(fileId);
  return NextResponse.json({ success: true });
}
