/** Decode locally and bake camera orientation into a portable PNG. */
export async function importImage(file: File): Promise<string> {
  if (file.size > 8 * 1024 * 1024) throw new Error('Choose a PNG or JPEG up to 8 MiB.');
  const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v);
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (!png && !jpeg) throw new Error('Choose a PNG or JPEG image.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const { naturalWidth: width, naturalHeight: height } = image;
    if (!width || !height || width > 4096 || height > 4096)
      throw new Error('Choose an image no larger than 4096 × 4096 pixels.');
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Image decoding is unavailable.');
    ctx.drawImage(image, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((result) => (result ? resolve(result) : reject(new Error('Cannot encode image.'))), 'image/png'),
    );
    if (blob.size > 16 * 1024 * 1024) throw new Error('Decoded PNG exceeds 16 MiB. Choose a smaller image.');
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Cannot read image.'));
      reader.readAsDataURL(blob);
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
