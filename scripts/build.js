const fs = require('fs');
const path = require('path');
const JSZip = require('node-zip');

// Function to recursively get all files in a directory
function getAllFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);

  files.forEach(file => {
    const filePath = path.join(dirPath, file);
    if (fs.statSync(filePath).isDirectory()) {
      arrayOfFiles = getAllFiles(filePath, arrayOfFiles);
    } else {
      arrayOfFiles.push(filePath);
    }
  });

  return arrayOfFiles;
}

// Create a new zip instance
const zip = new JSZip();

// Get all files from dist directory
const distPath = path.join(__dirname, '../dist');
const allFiles = getAllFiles(distPath);

// Add each file to the zip
allFiles.forEach(filePath => {
  // Skip the ext.zip file if it exists
  if (filePath.endsWith('ext.zip')) return;

  const fileContent = fs.readFileSync(filePath);
  const relativePath = path.relative(distPath, filePath);
  zip.file(relativePath, fileContent);
});

// Generate zip file
const zipContent = zip.generate({ base64: false, compression: 'DEFLATE' });
fs.writeFileSync(path.join(distPath, 'ext.zip'), zipContent, 'binary');

console.log('Created dist/ext.zip');
