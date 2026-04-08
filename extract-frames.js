const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Get ffmpeg-static binary path
const ffmpegPath = require('ffmpeg-static');

const videoPath = path.join(__dirname, 'frontend', 'Designing_a_Premium_Gaming_Website.mp4');
const outputDir = path.join(__dirname, 'frontend', 'frames');

// Create frames directory if it doesn't exist
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

console.log('🎬 Extracting frames from video...');
console.log(`📹 Video: ${videoPath}`);
console.log(`📁 Output: ${outputDir}`);

try {
  // Extract frames at 12fps (60 frames for ~5 second video)
  const command = `"${ffmpegPath}" -i "${videoPath}" -vf fps=12 "${outputDir}/frame_%04d.jpg"`;
  console.log(`⏳ Running: ${command}\n`);
  
  execSync(command, { stdio: 'inherit' });
  
  // Count extracted frames
  const files = fs.readdirSync(outputDir).filter(f => f.endsWith('.jpg'));
  console.log(`\n✅ Successfully extracted ${files.length} frames!`);
  console.log(`📸 Frames saved to: ${outputDir}`);
  
} catch (error) {
  console.error('❌ Error extracting frames:', error.message);
  process.exit(1);
}
