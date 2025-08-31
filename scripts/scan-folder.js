const fs = require('fs');
const path = require('path');

const PHOTOS_DIR = 'images/photo';
const OUTPUT_FILE = 'data/folder-template.json';
const LAST_SCAN_FILE = 'data/last-scan.txt';

function scanPhotoDirectories() {
  const folderData = [];

  try {
    const yearDirs = fs.readdirSync(PHOTOS_DIR)
      .filter(item => fs.statSync(path.join(PHOTOS_DIR, item)).isDirectory())
      .sort();

    for (const year of yearDirs) {
      const yearPath = path.join(PHOTOS_DIR, year);
      const folderDirs = fs.readdirSync(yearPath)
        .filter(item => fs.statSync(path.join(yearPath, item)).isDirectory())
        .sort();

      for (const folderName of folderDirs) {
        const folderPath = path.join(yearPath, folderName);
        const photoFiles = fs.readdirSync(folderPath)
          .filter(file => {
            const ext = path.extname(file).toLowerCase();
            return ['.jpg', '.jpeg', '.png', '.gif', '.bmp'].includes(ext);
          })
          .map(file => path.basename(file, path.extname(file)))
          .sort();

        folderData.push({
          year: year,
          folderName: folderName,
          photosName: photoFiles
        });
      }
    }

    const result = {
      folderData: folderData
    };

    let jsonString = JSON.stringify(result, null, 2);
    jsonString = jsonString.replace(/("photosName":\s*)\[\s*\n\s*([^\]]+)\s*\n\s*\]/g, (match, prefix, content) => {
      const items = content.split(',').map(item => item.trim());
      return prefix + '[' + items.join(', ') + ']';
    });

    fs.writeFileSync(OUTPUT_FILE, jsonString);

    const now = new Date();
    const timeString = now.getFullYear() + '/' +
                      String(now.getMonth() + 1).padStart(2, '0') + '/' +
                      String(now.getDate()).padStart(2, '0') + ' ' +
                      String(now.getHours()).padStart(2, '0') + ':' +
                      String(now.getMinutes()).padStart(2, '0') + ':' +
                      String(now.getSeconds()).padStart(2, '0');

    fs.writeFileSync(LAST_SCAN_FILE, `Last scan time: ${timeString}`);

    console.log(`Generated ${OUTPUT_FILE} with ${folderData.length} folders`);
    console.log(`Last scan time saved to ${LAST_SCAN_FILE}`);

    folderData.forEach(folder => {
      console.log(`${folder.year}/${folder.folderName}: ${folder.photosName.length} photos`);
    });

  } catch (error) {
    console.error('Error scanning directories:', error);
  }
}

scanPhotoDirectories();