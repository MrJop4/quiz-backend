const fs = require('fs');
const path = require('path');
const questionDatabase = require('../questiondatabase.js');

// --- calculate similarity ---
// Levenshtein distance: measure of the difference between two sequences.
function levenshtein(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix = Array(a.length + 1).fill(null).map(() => Array(b.length + 1).fill(null));
  for (let i = 0; i <= a.length; i += 1) {
    matrix[i][0] = i;
  }
  for (let j = 0; j <= b.length; j += 1) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // Deletion
        matrix[i][j - 1] + 1,      // Insertion
        matrix[i - 1][j - 1] + cost // Substitution
      );
    }
  }
  return matrix[a.length][b.length];
}

// get all image paths from the db
const dbImages = new Set(
  questionDatabase
    .filter(q => q.image)
    .map(q => path.normalize(q.image)) 
);

console.log(`\n🔎 Found ${dbImages.size} unique image references in the database.`);

// get all image files from the filesystem
const imageDir = path.join(__dirname, '..', 'public', 'images');
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
        const relativePath = path.relative(path.join(__dirname, '..'), fullPath);
        fsImages.add(path.normalize(relativePath));
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

try {
  findImagesInDir(imageDir);
  console.log(`🖼️  Found ${fsImages.size} image files on the filesystem.`);

  console.log('\n--- Analysis ---');

  // broken links
  const brokenLinks = [...dbImages].filter(dbImage => !fsImages.has(dbImage));
  const fsImagesArray = [...fsImages];
  const suggestions = new Map();

  if (brokenLinks.length > 0) {
    console.log(`\n❌ WARNING: ${brokenLinks.length} broken image links found. Analyzing for suggestions...`);
    
    brokenLinks.forEach(brokenLink => {
        let bestMatch = null;
        let minDistance = Infinity;

        // Comparison into match
        fsImagesArray.forEach(fsImage => {
            // Using Levenshtein distance on lowercase basenames is a good heuristic for typos and case issues
            const dist = levenshtein(path.basename(brokenLink).toLowerCase(), path.basename(fsImage).toLowerCase());
            if (dist < minDistance) {
                minDistance = dist;
                bestMatch = fsImage;
            }
        });

        // Only suggest if the match is reasonably close.
        if (bestMatch && minDistance <= 4) {
            suggestions.set(brokenLink, { suggestion: bestMatch, distance: minDistance });
        } else {
            suggestions.set(brokenLink, { suggestion: null, distance: minDistance });
        }
    });

    console.log('\n--- FIX SUGGESTIONS ---');
    suggestions.forEach((value, key) => {
        console.log(`\n- BROKEN:     ${key.replace(/\\/g, '/')}`);
        if (value.suggestion) {
            console.log(`+ SUGGESTION: ${value.suggestion.replace(/\\/g, '/')} (Similarity distance: ${value.distance})`);
        } else {
            console.log(`  (No close match found)`);
        }
    });

  } else {
    console.log('\n✅ SUCCESS: All images in the database seem to exist on the filesystem.');
  }

  // (unused images)
  const unusedImages = [...fsImages].filter(fsImage => !dbImages.has(fsImage));

  if (unusedImages.length > 0) {
    console.log(`\n\n--- UNUSED IMAGES ---`);
    console.log(`🟡 INFO: ${unusedImages.length} unused image files found on the filesystem:`);
    unusedImages.forEach(img => console.log(`   - ${img.replace(/\\/g, '/')}`));
  } else {
    console.log('\n✅ SUCCESS: All image files on the filesystem are used in the database.');
  }

} catch (error) {
  if (error.code === 'ENOENT') {
    console.error(`\n❌ ERROR: The 'public/images' directory was not found. Make sure you run this script from the project root.`);
  } else {
    console.error('\n❌ An unexpected error occurred:', error);
  }
}