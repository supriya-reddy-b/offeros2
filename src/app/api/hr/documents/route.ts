import { NextRequest, NextResponse } from "next/server";
import { getCommonDocuments, uploadFile, deleteFile } from "@/lib/box";

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
  const file = formData.get("file") as File;
  const folderId = formData.get("folderId") as string | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const targetFolder = folderId || process.env.BOX_COMMON_FOLDER_ID || "0";

  try {
    const uploaded = await uploadFile(targetFolder, file.name, buffer);
    return NextResponse.json(uploaded, { status: 201 });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const { fileId } = await request.json();
  await deleteFile(fileId);
  return NextResponse.json({ success: true });
}
