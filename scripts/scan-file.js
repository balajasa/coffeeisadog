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

  // 掃描資料夾 - 新的階層結構: images/photo/年份/國家/
  const yearFolders = fs.readdirSync(photoDir);

  yearFolders.forEach(yearFolder => {
    const yearPath = path.join(photoDir, yearFolder);
    if (!fs.statSync(yearPath).isDirectory()) return;

    const year = yearFolder;

    // 掃描年份資料夾下的國家資料夾
    const countryFolders = fs.readdirSync(yearPath);

    countryFolders.forEach(countryFolder => {
      const countryPath = path.join(yearPath, countryFolder);
      if (!fs.statSync(countryPath).isDirectory()) return;

      const country = countryFolder;
      const photos = fs.readdirSync(countryPath)
        .filter(file => /\.(jpg|jpeg|png|gif|webp)$/i.test(file))
        .map(file => path.parse(file).name);

      // 按城市分組
      const cities = {};
      photos.forEach(photo => {
        const city = photo.split('_')[0];
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
      console.log('⚠️  讀取 travels.json 時發生錯誤，將以空資料開始');
      existing = [];
    }
  }

  const existingMap = new Map();
  existing.forEach(t => {
    const key = `${t.year}_${t.country}`;
    existingMap.set(key, t);
  });

  // 分析變化 - 先宣告所有變數
  const newTrips = [];
  const updatedTrips = [];
  const unchangedTrips = [];
  const deletedTrips = [];
  const tripsWithDeletedPhotos = [];
  const tripsNeedCityFix = [];

  // 處理掃描到的行程
  Object.keys(trips).forEach(tripKey => {
    const scannedTrip = trips[tripKey];

    if (!existingMap.has(tripKey)) {
      // 全新行程
      newTrips.push(scannedTrip);
    } else {
      // 現有行程，檢查是否有新照片或刪除照片
      const existingTrip = existingMap.get(tripKey);
      const existingPhotos = Array.isArray(existingTrip.photo) ? existingTrip.photo : [];
      const scannedPhotos = scannedTrip.photos;

      // 檢查城市欄位是否需要修復（有照片但city是空的）
      const existingCities = Array.isArray(existingTrip.city) ? existingTrip.city : [];
      const shouldHaveCities = existingPhotos.length > 0;
      const hasCityData = existingCities.length > 0;

      if (shouldHaveCities && !hasCityData) {
        // 需要修復城市欄位
        const cities = {};
        existingPhotos.forEach(photo => {
          const city = photo.split('_')[0];
          if (!cities[city]) cities[city] = [];
          cities[city].push(photo);
        });
        const cityList = Object.keys(cities).sort();

        const fixedTrip = {
          ...existingTrip,
          city: cityList
        };

        tripsNeedCityFix.push({
          tripKey,
          originalTrip: existingTrip,
          fixedTrip: fixedTrip,
          addedCities: cityList
        });
        return; // 跳過其他檢查，因為這是修復操作
      }

      const newPhotos = scannedPhotos.filter(photo =>
        !existingPhotos.includes(photo)
      );

      const deletedPhotos = existingPhotos.filter(photo =>
        !scannedPhotos.includes(photo)
      );

      if (newPhotos.length > 0 || deletedPhotos.length > 0) {
        if (deletedPhotos.length > 0) {
          // 有照片被刪除
          tripsWithDeletedPhotos.push({
            tripKey,
            originalTrip: existingTrip,
            deletedPhotos: deletedPhotos,
            remainingPhotos: scannedPhotos,
            newPhotos: newPhotos
          });
        }

        if (newPhotos.length > 0) {
          // 重新解析所有照片的城市名稱
          const allPhotos = [...existingPhotos, ...newPhotos].sort();
          const cities = {};
          allPhotos.forEach(photo => {
            const city = photo.split('_')[0];
            if (!cities[city]) cities[city] = [];
            cities[city].push(photo);
          });
          const cityList = Object.keys(cities).sort();

          // 合併照片，保留原有資訊，更新城市列表
          const mergedTrip = {
            ...existingTrip,
            city: cityList,
            photo: allPhotos
          };

          updatedTrips.push({
            tripKey,
            originalTrip: existingTrip,
            updatedTrip: mergedTrip,
            newPhotos: newPhotos
          });
        }
      } else {
        unchangedTrips.push(tripKey);
      }
    }
  });

  // 檢查被完全刪除的行程（JSON中有但資料夾中沒有）
  existing.forEach(trip => {
    const tripKey = `${trip.year}_${trip.country}`;
    if (!trips[tripKey]) {
      deletedTrips.push({
        tripKey,
        trip: trip,
        reason: '資料夾不存在'
      });
    }
  });

  // 準備輸出到 template.json 的資料
  const templateData = {
    scanResult: {
      timestamp: new Date().toISOString(),
      summary: {
        newTrips: newTrips.length,
        updatedTrips: updatedTrips.length,
        unchangedTrips: unchangedTrips.length,
        deletedTrips: deletedTrips.length,
        tripsWithDeletedPhotos: tripsWithDeletedPhotos.length,
        tripsNeedCityFix: tripsNeedCityFix.length
      }
    },
    newTrips: [],
    updatedTrips: [],
    deletedTrips: [],
    tripsWithDeletedPhotos: [],
    tripsNeedCityFix: []
  };

  // 處理新增行程
  newTrips.forEach(trip => {
    const tripData = {
      year: trip.year,
      startDate: "MM-DD",
      endDate: "MM-DD",
      country: trip.country,
      city: trip.cities,
      city_tw: trip.cities.slice(),
      state_tw: [],
      photo: trip.photos
    };
    templateData.newTrips.push(tripData);
  });

  // 處理更新行程
  updatedTrips.forEach(update => {
    const { tripKey, originalTrip, updatedTrip, newPhotos } = update;
    templateData.updatedTrips.push({
      tripKey: tripKey,
      displayName: Array.isArray(originalTrip.city_tw)
        ? originalTrip.city_tw.join(', ')
        : (originalTrip.city_tw || (Array.isArray(originalTrip.city) ? originalTrip.city.join(', ') : originalTrip.city)),
      newPhotos: newPhotos,
      updatedRecord: updatedTrip
    });
  });

  // 處理被刪除的行程
  deletedTrips.forEach(deleted => {
    templateData.deletedTrips.push({
      tripKey: deleted.tripKey,
      displayName: Array.isArray(deleted.trip.city_tw)
        ? deleted.trip.city_tw.join(', ')
        : (deleted.trip.city_tw || (Array.isArray(deleted.trip.city) ? deleted.trip.city.join(', ') : deleted.trip.city)),
      reason: deleted.reason,
      originalRecord: deleted.trip
    });
  });

  // 處理有照片被刪除的行程
  tripsWithDeletedPhotos.forEach(deleted => {
    const { tripKey, originalTrip, deletedPhotos, remainingPhotos, newPhotos } = deleted;

    // 重新解析剩餘照片的城市名稱
    const cities = {};
    remainingPhotos.forEach(photo => {
      const city = photo.split('_')[0];
      if (!cities[city]) cities[city] = [];
      cities[city].push(photo);
    });
    const cityList = Object.keys(cities).sort();

    // 建立更新後的記錄（只保留存在的照片，更新城市列表）
    const updatedRecord = {
      ...originalTrip,
      city: cityList,
      photo: remainingPhotos
    };

    templateData.tripsWithDeletedPhotos.push({
      tripKey: tripKey,
      displayName: Array.isArray(originalTrip.city_tw)
        ? originalTrip.city_tw.join(', ')
        : (originalTrip.city_tw || (Array.isArray(originalTrip.city) ? originalTrip.city.join(', ') : originalTrip.city)),
      deletedPhotos: deletedPhotos,
      newPhotos: newPhotos || [],
      updatedRecord: updatedRecord
    });
  });

  // 處理需要修復城市欄位的行程
  tripsNeedCityFix.forEach(fix => {
    const { tripKey, originalTrip, fixedTrip, addedCities } = fix;
    templateData.tripsNeedCityFix.push({
      tripKey: tripKey,
      displayName: Array.isArray(originalTrip.city_tw)
        ? originalTrip.city_tw.join(', ')
        : (originalTrip.city_tw || (Array.isArray(originalTrip.city) ? originalTrip.city.join(', ') : originalTrip.city)),
      addedCities: addedCities,
      fixedRecord: fixedTrip
    });
  });

  // 更新最後掃描時間
  const lastScanPath = path.join(__dirname, '../data/last-scan.txt');
  const now = new Date();

  // 可選的時間格式：
  // const currentTime = now.toISOString(); // ISO格式: 2025-06-24T12:00:00.000Z
  // const currentTime = now.toLocaleString('zh-TW'); // 台灣格式: 2025/6/24 下午8:00:00
  // const currentTime = now.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }); // 台北時間

  const currentTime = now.toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const scanTimeMessage = `Last scan time: ${currentTime}`;
  try {
    fs.writeFileSync(lastScanPath, scanTimeMessage, 'utf8');
  } catch (error) {
    console.log('⚠️  無法更新掃描時間檔案:', error.message);
  }

  // 寫入 template.json
  const templatePath = path.join(__dirname, '../data/template.json');
  try {
    // 自定義 JSON 格式化，讓陣列顯示在同一行
    const jsonString = JSON.stringify(templateData, null, 2)
      .replace(/(\s*)"([^"]+)":\s*\[\s*\n(\s*)"([^"]*)"((?:\s*,\s*\n\s*"[^"]*")*)\s*\n\s*\]/g, (match, indent, key, innerIndent, firstItem, restItems) => {
        // 處理陣列內容，將所有項目放在同一行
        const items = [firstItem];
        if (restItems) {
          const additionalItems = restItems.match(/"[^"]*"/g);
          if (additionalItems) {
            items.push(...additionalItems.map(item => item.slice(1, -1))); // 移除引號
          }
        }
        const formattedItems = items.map(item => `"${item}"`).join(', ');
        return `${indent}"${key}": [ ${formattedItems} ]`;
      });

    fs.writeFileSync(templatePath, jsonString, 'utf8');

    // 簡化的 console 輸出
    console.log('📊 掃描完成！');
    console.log('─────────────────────────────────────');

    if (newTrips.length > 0) {
      console.log(`✨ 發現 ${newTrips.length} 個新增行程`);
    }

    if (updatedTrips.length > 0) {
      console.log(`🔄 發現 ${updatedTrips.length} 個更新行程`);
      updatedTrips.forEach(update => {
        const displayName = Array.isArray(update.originalTrip.city_tw)
          ? update.originalTrip.city_tw.join(', ')
          : (update.originalTrip.city_tw || (Array.isArray(update.originalTrip.city) ? update.originalTrip.city.join(', ') : update.originalTrip.city));
        console.log(`   - ${update.tripKey} (${displayName}): +${update.newPhotos.length} 張照片`);
      });
    }

    if (deletedTrips.length > 0) {
      console.log(`🗑️  發現 ${deletedTrips.length} 個被刪除的行程`);
      deletedTrips.forEach(deleted => {
        const displayName = Array.isArray(deleted.trip.city_tw)
          ? deleted.trip.city_tw.join(', ')
          : (deleted.trip.city_tw || (Array.isArray(deleted.trip.city) ? deleted.trip.city.join(', ') : deleted.trip.city));
        console.log(`   - ${deleted.tripKey} (${displayName}): ${deleted.reason}`);
      });
    }

    if (tripsWithDeletedPhotos.length > 0) {
      console.log(`📸 發現 ${tripsWithDeletedPhotos.length} 個行程有照片被刪除`);
      tripsWithDeletedPhotos.forEach(deleted => {
        const displayName = Array.isArray(deleted.originalTrip.city_tw)
          ? deleted.originalTrip.city_tw.join(', ')
          : (deleted.originalTrip.city_tw || (Array.isArray(deleted.originalTrip.city) ? deleted.originalTrip.city.join(', ') : deleted.originalTrip.city));
        console.log(`   - ${deleted.tripKey} (${displayName}): -${deleted.deletedPhotos.length} 張照片`);
      });
    }

    if (tripsNeedCityFix.length > 0) {
      console.log(`🔧 發現 ${tripsNeedCityFix.length} 個行程需要修復城市欄位`);
      tripsNeedCityFix.forEach(fix => {
        const displayName = Array.isArray(fix.originalTrip.city_tw)
          ? fix.originalTrip.city_tw.join(', ')
          : (fix.originalTrip.city_tw || (Array.isArray(fix.originalTrip.city) ? fix.originalTrip.city.join(', ') : fix.originalTrip.city));
        console.log(`   - ${fix.tripKey} (${displayName}): 添加城市 [${fix.addedCities.join(', ')}]`);
      });
    }

    if (unchangedTrips.length > 0) {
      console.log(`✅ ${unchangedTrips.length} 個行程無變化`);
    }

    if (newTrips.length === 0 && updatedTrips.length === 0 && deletedTrips.length === 0 && tripsWithDeletedPhotos.length === 0 && tripsNeedCityFix.length === 0) {
      console.log('🎉 所有行程都是最新狀態！');
    } else {
      console.log(`\n📄 詳細結果已輸出到: template.json`);
      console.log('📝 請查看該檔案進行後續處理');

      if (deletedTrips.length > 0 || tripsWithDeletedPhotos.length > 0) {
        console.log('⚠️  發現刪除項目，請檢查是否需要更新 travels.json');
      }

      if (tripsNeedCityFix.length > 0) {
        console.log('🔧 發現需要修復的城市欄位，請檢查 template.json 中的 tripsNeedCityFix');
      }
    }

  } catch (error) {
    console.error('❌ 寫入 template.json 時發生錯誤:', error.message);
  }
}

scanPhotos();