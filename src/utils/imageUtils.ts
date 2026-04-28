/**
 * Compress an image file before uploading to storage.
 * Reduces file size significantly while maintaining acceptable quality.
 */
export async function compressImage(
  file: File,
  options: { maxWidth?: number; maxHeight?: number; quality?: number } = {}
): Promise<File> {
  const { maxWidth = 1200, maxHeight = 1200, quality = 0.8 } = options;

  // Skip compression for small files (< 100KB) or non-image files
  if (file.size < 100 * 1024 || !file.type.startsWith('image/')) {
    return file;
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    img.onload = () => {
      let { width, height } = img;

      // Scale down if larger than max dimensions
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      canvas.width = width;
      canvas.height = height;
      ctx?.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file); // fallback to original
            return;
          }
          const compressedFile = new File([blob], file.name, {
            type: 'image/webp',
            lastModified: Date.now(),
          });
          // Only use compressed if it's actually smaller
          resolve(compressedFile.size < file.size ? compressedFile : file);
        },
        'image/webp',
        quality
      );
    };

    img.onerror = () => resolve(file); // fallback to original on error
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Upload an image to Supabase storage with compression.
 */
export async function uploadCompressedImage(
  supabase: any,
  bucket: string,
  path: string,
  file: File,
  options?: { upsert?: boolean; maxWidth?: number; quality?: number }
): Promise<{ publicUrl: string } | null> {
  try {
    const compressed = await compressImage(file, {
      maxWidth: options?.maxWidth,
      quality: options?.quality,
    });

    // Change extension to .webp if compressed
    const finalPath = compressed.type === 'image/webp'
      ? path.replace(/\.[^.]+$/, '.webp')
      : path;

    const { error } = await supabase.storage
      .from(bucket)
      .upload(finalPath, compressed, {
        upsert: options?.upsert ?? false,
        contentType: compressed.type,
        // Cache no navegador por 7 dias — cardápio público abre instantâneo nas visitas seguintes.
        // Como os nomes de arquivo já incluem timestamp/uuid, trocas de imagem geram URL nova
        // e o navegador busca a versão atualizada normalmente.
        cacheControl: '604800',
      });

    if (error) throw error;

    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(finalPath);

    return { publicUrl };
  } catch (error) {
    console.error('Error uploading image:', error);
    return null;
  }
}
