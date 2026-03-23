/**
 * Video Split Service
 * Handles splitting long videos into equal parts for WhatsApp status uploads
 */

const ffmpeg = require('fluent-ffmpeg');
const ffprobeInstaller = require('@ffprobe-installer/ffprobe');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Set ffprobe path
ffmpeg.setFfprobePath(ffprobeInstaller.path);

const MAX_STATUS_DURATION = 60; // WhatsApp status max duration in seconds
const UPLOADS_DIR = path.join(__dirname, '../../../uploads/video-splits');

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

/**
 * Convert external URL to local file path (Docker can't resolve external hostnames)
 */
function urlToLocalPath(urlOrPath) {
  if (urlOrPath && urlOrPath.match(/^https?:\/\//)) {
    return urlOrPath.replace(
      /^https?:\/\/[^\/]+\/api\/uploads\//,
      path.join(__dirname, '../../..', 'uploads') + '/'
    );
  }
  return urlOrPath;
}

/**
 * Get video duration in seconds
 * @param {string} inputPath - Path to video file or URL
 * @returns {Promise<number>} - Duration in seconds
 */
async function getVideoDuration(inputPath) {
  const localPath = urlToLocalPath(inputPath);
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(localPath, (err, metadata) => {
      if (err) {
        reject(err);
        return;
      }
      const duration = metadata?.format?.duration;
      if (typeof duration !== 'number') {
        reject(new Error('Could not determine video duration'));
        return;
      }
      resolve(duration);
    });
  });
}

/**
 * Calculate equal split points for a video
 * @param {number} duration - Total duration in seconds
 * @param {number} maxDuration - Maximum duration per part (default 60s)
 * @returns {Array<{start: number, duration: number, partNumber: number}>}
 */
function calculateSplitPoints(duration, maxDuration = MAX_STATUS_DURATION) {
  if (duration <= maxDuration) {
    return [{ start: 0, duration: duration, partNumber: 1 }];
  }

  // Calculate number of parts needed
  const numParts = Math.ceil(duration / maxDuration);
  
  // Calculate equal duration for each part
  const partDuration = duration / numParts;
  
  const parts = [];
  for (let i = 0; i < numParts; i++) {
    parts.push({
      start: i * partDuration,
      duration: partDuration,
      partNumber: i + 1
    });
  }
  
  return parts;
}

/**
 * Split a video into equal parts
 * @param {string} inputPath - Path to input video file
 * @param {number} maxDuration - Maximum duration per part (default 60s)
 * @returns {Promise<Array<{path: string, partNumber: number, duration: number}>>}
 */
async function splitVideo(inputPath, maxDuration = MAX_STATUS_DURATION) {
  const duration = await getVideoDuration(inputPath);
  
  if (duration <= maxDuration) {
    return [{
      path: inputPath,
      partNumber: 1,
      duration: duration,
      isOriginal: true
    }];
  }

  const splitPoints = calculateSplitPoints(duration, maxDuration);
  const outputDir = path.join(UPLOADS_DIR, uuidv4());
  
  // Create output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const results = [];
  
  for (const split of splitPoints) {
    const outputPath = path.join(outputDir, `part_${split.partNumber}.mp4`);
    
    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .setStartTime(split.start)
        .setDuration(split.duration)
        .output(outputPath)
        .outputOptions([
          '-c:v', 'libx264',
          '-c:a', 'aac',
          '-preset', 'fast',
          '-crf', '23',
          '-movflags', '+faststart'
        ])
        .on('end', () => {
          console.log(`[VideoSplit] Created part ${split.partNumber}`);
          resolve();
        })
        .on('error', (err) => {
          console.error(`[VideoSplit] Error creating part ${split.partNumber}:`, err.message);
          reject(err);
        })
        .run();
    });
    
    results.push({
      path: outputPath,
      partNumber: split.partNumber,
      duration: split.duration,
      isOriginal: false
    });
  }
  
  return results;
}

/**
 * Split video from URL
 * Downloads to temp file first, then splits
 * @param {string} videoUrl - URL to video
 * @param {number} maxDuration - Maximum duration per part
 * @returns {Promise<Array<{path: string, partNumber: number, duration: number}>>}
 */
async function splitVideoFromUrl(videoUrl, maxDuration = MAX_STATUS_DURATION) {
  // ffmpeg can handle URLs directly
  return splitVideo(videoUrl, maxDuration);
}

/**
 * Check if video needs splitting
 * @param {string} inputPath - Path to video file or URL
 * @returns {Promise<{needsSplit: boolean, duration: number, partsCount: number}>}
 */
async function checkVideoNeedsSplit(inputPath) {
  try {
    const duration = await getVideoDuration(inputPath);
    const needsSplit = duration > MAX_STATUS_DURATION;
    const partsCount = needsSplit ? Math.ceil(duration / MAX_STATUS_DURATION) : 1;
    
    return {
      needsSplit,
      duration,
      partsCount,
      partDuration: needsSplit ? duration / partsCount : duration
    };
  } catch (err) {
    console.error('[VideoSplit] Error checking video:', err.message);
    throw err;
  }
}

/**
 * Clean up split files after processing
 * @param {Array<{path: string, isOriginal: boolean}>} parts - Array of split parts
 */
async function cleanupSplitFiles(parts) {
  for (const part of parts) {
    if (!part.isOriginal && fs.existsSync(part.path)) {
      try {
        fs.unlinkSync(part.path);
        console.log(`[VideoSplit] Cleaned up ${part.path}`);
      } catch (err) {
        console.error(`[VideoSplit] Error cleaning up ${part.path}:`, err.message);
      }
    }
  }
  
  // Also try to clean up the parent directory if empty
  if (parts.length > 0 && !parts[0].isOriginal) {
    const dir = path.dirname(parts[0].path);
    try {
      const files = fs.readdirSync(dir);
      if (files.length === 0) {
        fs.rmdirSync(dir);
        console.log(`[VideoSplit] Cleaned up directory ${dir}`);
      }
    } catch (err) {
      // Ignore errors on directory cleanup
    }
  }
}

module.exports = {
  getVideoDuration,
  calculateSplitPoints,
  splitVideo,
  splitVideoFromUrl,
  checkVideoNeedsSplit,
  cleanupSplitFiles,
  MAX_STATUS_DURATION
};
