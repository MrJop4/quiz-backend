const fs = require('fs');
const path = require('path');
const questionDatabase = require('./questiondatabase.js');

// 1. Get all image paths from the database
const dbImages = new Set(
  questionDatabase
    .filter(q => q.image)
    .map(q => path.normalize(q.image)) // Normalize paths for cross-os compatibility
);

console.log(`\n🔎 Found ${dbImages.size} unique image references in the database.`);

// 2. Get all image files from the filesystem
const imageDir = path.join(__dirname, 'images');
let fsImages = new Set();

function findImagesInDir(directory) {
  try {
    const files = fs.readdirSync(directory);
    for (const file of files) {
      const fullPath = path.join(directory, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        findImagesInDir(fullPath);
      } else if (/\.(jpg|jpeg|png|gif)$/i.test(file)) {
        // Get path relative to project root and normalize
        const relativePath = path.relative(__dirname, fullPath);
        fsImages.add(path.normalize(relativePath));
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    // Ignore if a subdirectory doesn't exist
  }
}

try {
  findImagesInDir(imageDir);
  console.log(`🖼️  Found ${fsImages.size} image files on the filesystem.`);

  // 3. Compare the two sets
  console.log('\n--- Analysis ---');

  // Images in DB but not in filesystem (broken links)
  const brokenLinks = [...dbImages].filter(dbImage => !fsImages.has(dbImage));

  if (brokenLinks.length > 0) {
    console.log(`\n❌ WARNING: ${brokenLinks.length} broken image links found in questiondatabase.js:`);
    brokenLinks.forEach(link => console.log(`   - ${link}`));
  } else {
    console.log('\n✅ SUCCESS: All images in the database seem to exist on the filesystem.');
  }

  // Images in filesystem but not in DB (unused images)
  const unusedImages = [...fsImages].filter(fsImage => !dbImages.has(fsImage));

  if (unusedImages.length > 0) {
    console.log(`\n🟡 INFO: ${unusedImages.length} unused image files found on the filesystem:`);
    unusedImages.forEach(img => console.log(`   - ${img}`));
  } else {
    console.log('\n✅ SUCCESS: All image files on the filesystem are used in the database.');
  }

} catch (error) {
  if (error.code === 'ENOENT') {
    console.error(`\n❌ ERROR: The 'images' directory was not found. Make sure you run this script from the project root 'quiz-backend'.`);
  } else {
    console.error('\n❌ An unexpected error occurred:', error);
  }
}