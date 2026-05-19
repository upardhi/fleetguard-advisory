import { NextRequest, NextResponse } from 'next/server';
import { uploadImage } from '../dl-ocr/imageUploadService';

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get('file') as File;

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'File size exceeds 5MB limit' }, { status: 400 });
  }
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: `File type ${file.type} not allowed. Use JPEG, PNG, or WebP` },
      { status: 400 }
    );
  }

  try {
    const imageUrl = await uploadImage(file, 'fg_photos');
    return NextResponse.json({ success: true, imageUrl });
  } catch (err: unknown) {
    console.error('[photo-upload] failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Upload failed' },
      { status: 500 }
    );
  }
}
