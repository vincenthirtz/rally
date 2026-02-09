// Rally Photo — Image Compression Web Worker
// Uses OffscreenCanvas to compress images off the main thread.

self.addEventListener("message", async (e) => {
  const { imageBitmap, maxSize, quality } = e.data;
  try {
    let w = imageBitmap.width;
    let h = imageBitmap.height;
    if (w > maxSize || h > maxSize) {
      const ratio = Math.min(maxSize / w, maxSize / h);
      w = Math.round(w * ratio);
      h = Math.round(h * ratio);
    }
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(imageBitmap, 0, 0, w, h);
    imageBitmap.close();
    const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: quality });
    self.postMessage({ blob });
  } catch (err) {
    self.postMessage({ error: err.message });
  }
});
