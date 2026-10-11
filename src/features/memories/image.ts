const MAX_SOURCE_BYTES = 15 * 1024 * 1024
const MAX_STORED_BYTES = 5 * 1024 * 1024
const MAX_EDGE = 1600

export async function preparePhoto(file: File): Promise<File> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('JPG, PNG 또는 WebP 사진을 선택해주세요.')
  }
  if (file.size > MAX_SOURCE_BYTES) throw new Error('사진은 15MB 이하로 선택해주세요.')

  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('사진을 줄이지 못했습니다.')
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()

    const toBlob = (quality: number) => new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('사진을 읽지 못했습니다.')), 'image/jpeg', quality)
    })
    let blob = await toBlob(0.82)
    if (blob.size > MAX_STORED_BYTES) blob = await toBlob(0.64)
    if (blob.size > MAX_STORED_BYTES) throw new Error('사진 용량이 커서 저장할 수 없습니다. 다른 사진을 선택해주세요.')
    return new File([blob], 'memory.jpg', { type: 'image/jpeg', lastModified: Date.now() })
  } catch (error) {
    if (error instanceof Error && error.message.includes('용량')) throw error
    if (file.size <= MAX_STORED_BYTES) return file
    throw new Error('이 사진 형식은 줄일 수 없습니다. JPG, PNG 또는 WebP 사진을 선택해주세요.', { cause: error })
  }
}
