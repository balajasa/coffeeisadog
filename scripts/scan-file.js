// scripts/scan-file.js
const fs = require('fs');
const path = require('path');

function scanPhotos() {
  const photoDir = path.join(__dirname, '../images/photo');

  if (!fs.existsSync(photoDir)) {
    console.log('❌ images/photo 資料夾不存在');
    return;
  }

  const trips = {};

  // 掃描資料夾
  const yearCountryFolders = fs.readdirSync(photoDir);

  yearCountryFolders.forEach(folder => {
    const folderPath = path.join(photoDir, folder);
    if (!fs.statSync(folderPath).isDirectory()) return;

    const [year, country] = folder.split('_');
    const photos = fs.readdirSync(folderPath)
      .filter(file => /\.(jpg|jpeg|png|gif|webp)$/i.test(file))
      .map(file => path.parse(file).name);

    // 按城市分組
    const cities = {};
    photos.forEach(photo => {
      const city = photo.split('_')[0]; // hokkaido_01 → hokkaido
      if (!cities[city]) cities[city] = [];
      cities[city].push(photo);
    });

    // 以年份+國家為key
    const tripKey = `${year}_${country}`;

    if (!trips[tripKey]) {
      trips[tripKey] = {
        year,
        country,
        cities: [],
        photos: []
      };
    }

    Object.keys(cities).forEach(city => {
      if (!trips[tripKey].cities.includes(city)) {
        trips[tripKey].cities.push(city);
      }
      trips[tripKey].photos.push(...cities[city]);
    });

    trips[tripKey].cities.sort();
    trips[tripKey].photos.sort();
  });

  // 檢查現有的 travels.json
  const travelsPath = path.join(__dirname, '../data/travels.json');
  let existing = [];

  if (fs.existsSync(travelsPath)) {
    try {
      const fileContent = fs.readFileSync(travelsPath, 'utf8');
      if (fileContent.trim()) {
        const data = JSON.parse(fileContent);
        existing = data.data || [];
      }
    } catch (error) {
      existing = [];
    }
  }

  const existingMap = new Map();
  existing.forEach(t => {
    existingMap.set(`${t.year}_${t.country}`, t);
  });

  // 分析變化
  const newTrips = [];
  const updatedTrips = [];

  Object.keys(trips).forEach(tripKey => {
    const scannedTrip = trips[tripKey];

    if (!existingMap.has(tripKey)) {
      newTrips.push(scannedTrip);
    } else {
      const existingTrip = existingMap.get(tripKey);
      const existingPhotos = existingTrip.photo || [];
      const scannedPhotos = scannedTrip.photos;

      const newPhotos = scannedPhotos.filter(photo =>
        !existingPhotos.includes(photo)
      );

      const existingCities = Array.isArray(existingTrip.city) ? existingTrip.city : [existingTrip.city];
      const newCities = scannedTrip.cities.filter(city =>
        !existingCities.includes(city)
      );

      if (newPhotos.length > 0 || newCities.length > 0) {
        updatedTrips.push({
          trip: scannedTrip,
          allPhotos: scannedPhotos,
          allCities: scannedTrip.cities
        });
      }
    }
  });

  // 顯示新增的旅程
  if (newTrips.length > 0) {
    newTrips.forEach(trip => {
      console.log(`{`);
      console.log(`  "year": "${trip.year}",`);
      console.log(`  "startDate": "MM-DD",`);
      console.log(`  "endDate": "MM-DD",`);
      console.log(`  "country": "${trip.country}",`);
      console.log(`  "city": [${trip.cities.map(c => `"${c}"`).join(', ')}],`);
      console.log(`  "photo": [${trip.photos.map(p => `"${p}"`).join(', ')}]`);
      console.log(`},`);
    });
  }

  // 顯示更新的旅程
  if (updatedTrips.length > 0) {
    updatedTrips.forEach(update => {
      const trip = update.trip;
      console.log(`{`);
      console.log(`  "year": "${trip.year}",`);
      console.log(`  "startDate": "MM-DD",`);
      console.log(`  "endDate": "MM-DD",`);
      console.log(`  "country": "${trip.country}",`);
      console.log(`  "city": [${update.allCities.map(c => `"${c}"`).join(', ')}],`);
      console.log(`  "city_tw": [${update.allCities.map(c => `"${c}"`).join(', ')}],`);
      console.log(`  "photo": [${update.allPhotos.map(p => `"${p}"`).join(', ')}]`);
      console.log(`},`);
    });
  }
}

scanPhotos();