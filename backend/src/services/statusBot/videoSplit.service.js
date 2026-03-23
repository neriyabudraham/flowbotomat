/**
 * Video Split Service
 * Handles splitting videos longer than 90 seconds into equal parts
 */

const ffmpeg = require('fluent-ffmpeg');
const ffprobeInstaller = require('@ffprobe-installer/ffprobe');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');

// Set ffprobe path
ffmpeg.setFfprobePath(ffprobeInstaller.path);

const MAX_DURATION = 90; // Max 90 seconds (1.5 minutes) per part
const UPLOAD_DIR = path.join(__dirname, '../../../uploads/status-videos');

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
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
 * @param {string} filePath - Path to video file or URL
 * @returns {Promise<number>} Duration in seconds
 */
async function getVideoDuration(filePath) {
  const localPath = urlToLocalPath(filePath);
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(localPath, (err, metadata) => {
      if (err) {
        reject(err);
        return;
      }
      const duration = metadata.format.duration;
      resolve(duration);
    });
  });
}

/**
 * Download video from URL to local file
 * @param {string} url - Video URL
 * @returns {Promise<string>} Local file path
 */
async function downloadVideo(url) {
  const filename = `${uuidv4()}.mp4`;
  const filePath = path.join(UPLOAD_DIR, filename);
  
  const response = await axios({
    method: 'GET',
    url: url,
    responseType: 'stream'
  });
  
  const writer = fs.createWriteStream(filePath);
  response.data.pipe(writer);
  
  return new Promise((resolve, reject) => {
    writer.on('finish', () => resolve(filePath));
    writer.on('error', reject);
  });
}

/**
 * Calculate how to split video into equal parts
 * @param {number} totalDuration - Total video duration in seconds
 * @returns {{partCount: number, partDuration: number}} Split info
 */
function calculateSplit(totalDuration) {
  if (totalDuration <= MAX_DURATION) {
    return { partCount: 1, partDuration: totalDuration };
  }
  
  // Calculate minimum parts needed
  const partCount = Math.ceil(totalDuration / MAX_DURATION);
  
  // Calculate equal duration per part
  const partDuration = totalDuration / partCount;
  
  return { partCount, partDuration };
}

/**
 * Split video into equal parts
 * @param {string} inputPath - Path to input video
 * @param {number} partDuration - Duration of each part in seconds
 * @param {number} partCount - Number of parts
 * @returns {Promise<string[]>} Array of output file paths
 */
async function splitVideo(inputPath, partDuration, partCount) {
  const outputPaths = [];
  const groupId = uuidv4();
  
  for (let i = 0; i < partCount; i++) {
    const outputFilename = `${groupId}_part${i + 1}.mp4`;
    const outputPath = path.join(UPLOAD_DIR, outputFilename);
    const startTime = i * partDuration;
    
    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .setStartTime(startTime)
        .setDuration(partDuration)
        .output(outputPath)
        .outputOptions([
          '-c:v', 'libx264',
          '-c:a', 'aac',
          '-preset', 'fast',
          '-movflags', '+faststart'
        ])
        .on('end', () => {
          console.log(`[VideoSplit] Part ${i + 1}/${partCount} complete: ${outputPath}`);
          resolve();
        })
        .on('error', (err) => {
          console.error(`[VideoSplit] Error splitting part ${i + 1}:`, err.message);
          reject(err);
        })
        .run();
    });
    
    outputPaths.push(outputPath);
  }
  
  return outputPaths;
}

/**
 * Check if video needs splitting and process it
 * @param {string} videoSource - Video URL or file path
 * @returns {Promise<{needsSplit: boolean, parts: Array<{filePath: string, partNumber: number, totalParts: number}>, duration: number, partDuration: number}>}
 */
async function processVideo(videoSource) {
  let localPath = videoSource;
  let isDownloaded = false;

  // Convert URL to local path if it's our own uploads URL (Docker can't resolve external hostname)
  if (videoSource.startsWith('http://') || videoSource.startsWith('https://')) {
    const converted = urlToLocalPath(videoSource);
    if (converted !== videoSource && fs.existsSync(converted)) {
      localPath = converted;
      console.log(`[VideoSplit] Using local path: ${localPath}`);
    } else {
      console.log(`[VideoSplit] Downloading video from URL...`);
      localPath = await downloadVideo(videoSource);
      isDownloaded = true;
    }
  }
  
  try {
    // Get duration
    const duration = await getVideoDuration(localPath);
    console.log(`[VideoSplit] Video duration: ${duration.toFixed(1)}s`);
    
    // Check if split needed
    if (duration <= MAX_DURATION) {
      return {
        needsSplit: false,
        parts: [{
          filePath: localPath,
          url: videoSource,
          partNumber: 1,
          totalParts: 1
        }],
        duration,
        partDuration: duration
      };
    }
    
    // Calculate and perform split
    const { partCount, partDuration } = calculateSplit(duration);
    console.log(`[VideoSplit] Splitting into ${partCount} parts of ~${partDuration.toFixed(1)}s each`);
    
    const outputPaths = await splitVideo(localPath, partDuration, partCount);
    
    // Clean up downloaded file (not the split parts)
    if (isDownloaded) {
      fs.unlinkSync(localPath);
    }
    
    // Generate URLs for split parts (relative to uploads folder)
    const parts = outputPaths.map((filePath, index) => ({
      filePath,
      url: `${process.env.APP_URL}/api/uploads/status-videos/${path.basename(filePath)}`,
      partNumber: index + 1,
      totalParts: partCount
    }));
    
    return {
      needsSplit: true,
      parts,
      duration,
      partDuration
    };
    
  } catch (err) {
    // Clean up on error
    if (isDownloaded && fs.existsSync(localPath)) {
      fs.unlinkSync(localPath);
    }
    throw err;
  }
}

/**
 * Clean up video files after they've been sent
 * @param {string[]} filePaths - Array of file paths to delete
 */
function cleanupVideoFiles(filePaths) {
  for (const filePath of filePaths) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`[VideoSplit] Cleaned up: ${filePath}`);
      }
    } catch (err) {
      console.error(`[VideoSplit] Failed to clean up ${filePath}:`, err.message);
    }
  }
}

/**
 * Format duration for display (e.g., "1:30" or "2:45")
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted duration
 */
function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

module.exports = {
  getVideoDuration,
  calculateSplit,
  processVideo,
  cleanupVideoFiles,
  formatDuration,
  MAX_DURATION
};
