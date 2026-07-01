/**
 * Receipt-scan client:
 *  - `captureReceipt()` opens the camera (Capacitor if native, file input if web).
 *  - `scanReceipt(groupId, blob, token)` uploads + returns parsed receipt.
 *  - `pickReceiptFile(file)` compresses a File chosen via <input type="file">.
 */
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { Capacitor } from '@capacitor/core'

const MAX_EDGE_PX = 1600

export async function captureReceipt() {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('captureReceipt() is Capacitor-only; use pickReceiptFile() on web.')
  }
  const photo = await Camera.getPhoto({
    resultType: CameraResultType.Base64,
    source: CameraSource.Prompt,
    quality: 80,
    allowEditing: false,
    width: MAX_EDGE_PX,
  })
  return base64ToBlob(photo.base64String, `image/${photo.format || 'jpeg'}`)
}

export async function pickReceiptFile(file) {
  return compressImage(file)
}

export async function scanReceipt(groupId, blob, token) {
  const form = new FormData()
  form.append('file', blob, 'receipt.jpg')
  const base = import.meta.env.VITE_API_BASE || '/api/v1'
  const resp = await fetch(`${base}/groups/${groupId}/expenses/scan-receipt`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  })
  if (!resp.ok) {
    const detail = (await resp.json().catch(() => ({}))).detail || `HTTP ${resp.status}`
    throw new Error(detail)
  }
  return resp.json()
}

function base64ToBlob(b64, mime) {
  const bin = atob(b64)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return new Blob([arr], { type: mime })
}

async function compressImage(file) {
  const img = document.createElement('img')
  const url = URL.createObjectURL(file)
  try {
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url })
    const scale = Math.min(1, MAX_EDGE_PX / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.round(img.naturalWidth * scale)
    const h = Math.round(img.naturalHeight * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0, w, h)
    return await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.8))
  } finally {
    URL.revokeObjectURL(url)
  }
}
