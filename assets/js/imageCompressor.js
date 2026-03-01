/**
 * imageCompressor.js — Enciclopedia Universitaria
 *
 * Client-side image compression before upload.
 * Uses the Canvas API (available in all modern browsers).
 *
 * Strategy:
 *  - Skip compression if file is already below COMPRESS_THRESHOLD bytes
 *  - Downscale to MAX_DIMENSION on the longest side (preserving aspect ratio)
 *  - Encode as WebP at TARGET_QUALITY; fall back to JPEG if WebP unsupported
 *  - If the compressed result is larger than the original, send the original
 *
 * Exposed as: window.compressImageFile(file) → Promise<File>
 */
(function () {
  'use strict';

  // ── Configuration ───────────────────────────────────────────────────────
  var COMPRESS_THRESHOLD = 500 * 1024;   // 500 KB  — skip if smaller
  var MAX_DIMENSION      = 1920;          // px      — longest side cap
  var TARGET_QUALITY     = 0.82;          // 0–1     — WebP / JPEG quality
  var MIN_QUALITY        = 0.55;          // floor for iterative reduction
  var QUALITY_STEP       = 0.08;          // step down per iteration
  var SIZE_TARGET        = 500 * 1024;   // 500 KB  — iterative target
  var SUPPORTED_TYPES    = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

  // Detect WebP encoding support once
  var supportsWebP = (function () {
    try {
      var c = document.createElement('canvas');
      c.width = 1; c.height = 1;
      return c.toDataURL('image/webp').startsWith('data:image/webp');
    } catch (e) {
      return false;
    }
  }());

  var outputMime = supportsWebP ? 'image/webp' : 'image/jpeg';
  var outputExt  = supportsWebP ? '.webp' : '.jpg';

  /**
   * Load a File/Blob into an HTMLImageElement.
   * @param {File} file
   * @returns {Promise<HTMLImageElement>}
   */
  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload  = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')); };
      img.src = url;
    });
  }

  /**
   * Draw image onto canvas, scaled so neither dimension exceeds MAX_DIMENSION.
   * @param {HTMLImageElement} img
   * @returns {HTMLCanvasElement}
   */
  function drawScaled(img) {
    var w = img.naturalWidth;
    var h = img.naturalHeight;

    if (w > MAX_DIMENSION || h > MAX_DIMENSION) {
      if (w >= h) {
        h = Math.round(h * MAX_DIMENSION / w);
        w = MAX_DIMENSION;
      } else {
        w = Math.round(w * MAX_DIMENSION / h);
        h = MAX_DIMENSION;
      }
    }

    var canvas = document.createElement('canvas');
    canvas.width  = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');
    // White background for images with transparency (PNG → JPEG fallback)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return canvas;
  }

  /**
   * Encode canvas to Blob at the given quality.
   * @param {HTMLCanvasElement} canvas
   * @param {number} quality  0–1
   * @returns {Promise<Blob>}
   */
  function canvasToBlob(canvas, quality) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(
        function (blob) {
          if (blob) resolve(blob);
          else reject(new Error('Canvas toBlob falló'));
        },
        outputMime,
        quality
      );
    });
  }

  /**
   * Iteratively reduce quality until the blob fits within SIZE_TARGET
   * or we hit MIN_QUALITY, whichever comes first.
   * @param {HTMLCanvasElement} canvas
   * @param {number} startQuality
   * @returns {Promise<Blob>}
   */
  async function encodeWithFallback(canvas, startQuality) {
    var quality = startQuality;
    var blob = await canvasToBlob(canvas, quality);

    while (blob.size > SIZE_TARGET && quality > MIN_QUALITY) {
      quality = Math.max(quality - QUALITY_STEP, MIN_QUALITY);
      blob = await canvasToBlob(canvas, quality);
    }

    return blob;
  }

  /**
   * Derive a safe output filename.
   * @param {string} originalName
   * @returns {string}
   */
  function outputFilename(originalName) {
    var base = (originalName || 'image').replace(/\.[^.]+$/, '');
    return base + outputExt;
  }

  /**
   * Main entry point.
   * Compresses a File if it exceeds COMPRESS_THRESHOLD.
   *
   * @param {File} file          Original image File
   * @param {object} [options]   Optional overrides
   * @param {number} [options.threshold]   Byte threshold (default 500 KB)
   * @param {number} [options.quality]     Initial quality 0–1 (default 0.82)
   * @param {function} [options.onProgress]  Called with status string
   * @returns {Promise<File>}    Compressed (or original) File
   */
  async function compressImageFile(file, options) {
    options = options || {};
    var threshold = options.threshold || COMPRESS_THRESHOLD;
    var quality   = options.quality   || TARGET_QUALITY;
    var onProgress = options.onProgress || null;

    // Guard: only compress supported image types
    if (!SUPPORTED_TYPES.includes(file.type)) {
      return file;
    }

    // Skip compression if already small enough
    if (file.size <= threshold) {
      if (onProgress) onProgress('sin comprimir (' + _fmtSize(file.size) + ')');
      return file;
    }

    if (onProgress) onProgress('comprimiendo…');

    var img;
    try {
      img = await loadImage(file);
    } catch (e) {
      console.warn('[imageCompressor] No se pudo cargar imagen, usando original:', e);
      return file;
    }

    var canvas = drawScaled(img);
    var blob;
    try {
      blob = await encodeWithFallback(canvas, quality);
    } catch (e) {
      console.warn('[imageCompressor] Compresión falló, usando original:', e);
      return file;
    }

    // If compression made it larger (rare but possible for tiny/already-compressed images)
    if (blob.size >= file.size) {
      if (onProgress) onProgress('ya comprimida (' + _fmtSize(file.size) + ')');
      return file;
    }

    var ratio = Math.round((1 - blob.size / file.size) * 100);
    if (onProgress) onProgress(_fmtSize(file.size) + ' → ' + _fmtSize(blob.size) + ' (−' + ratio + '%)');

    return new File([blob], outputFilename(file.name), { type: outputMime, lastModified: Date.now() });
  }

  /**
   * Compress an array/FileList of files, reporting aggregate progress.
   * @param {File[]|FileList} files
   * @param {function} [onProgress]  Called with (index, total, statusString)
   * @returns {Promise<File[]>}
   */
  async function compressImageFiles(files, onProgress) {
    var arr = Array.from(files);
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var f = arr[i];
      var compressed = await compressImageFile(f, {
        onProgress: onProgress
          ? function (msg) { onProgress(i, arr.length, msg); }
          : null
      });
      out.push(compressed);
    }
    return out;
  }

  function _fmtSize(bytes) {
    if (bytes < 1024)         return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  // ── Public API ────────────────────────────────────────────────────────
  window.ImageCompressor = {
    compressFile:  compressImageFile,
    compressFiles: compressImageFiles,
    isSupported: function () { return typeof HTMLCanvasElement !== 'undefined'; },
    THRESHOLD: COMPRESS_THRESHOLD
  };

  // Convenience alias
  window.compressImageFile  = compressImageFile;
  window.compressImageFiles = compressImageFiles;

}());
