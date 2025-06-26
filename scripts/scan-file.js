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

      // 解析多國家名稱（用底線分隔）
      const countries = countryFolder.split('_');
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

      // 以年份+國家組合為key（保持原有邏輯，但國家現在是陣列）
      const tripKey = `${year}_${countryFolder}`;

      if (!trips[tripKey]) {
        trips[tripKey] = {
          year,
          country: countries, // 改為陣列
          folderName: photos.length > 0 ? countryFolder : "", // 有照片才設定 folderName
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
    // 處理現有資料的 country 欄位（可能是字串或陣列）
    const countryArray = Array.isArray(t.country) ? t.country : [t.country];
    const key = `${t.year}_${countryArray.join('_')}`;
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
          city: cityList,
          country: Array.isArray(existingTrip.country) ? existingTrip.country : [existingTrip.country], // 確保 country 是陣列
          folderName: existingTrip.folderName || "" // 確保有 folderName 字段
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

          // 合併照片，保留原有資訊，更新城市列表和 folderName
          const mergedTrip = {
            ...existingTrip,
            city: cityList,
            photo: allPhotos,
            country: Array.isArray(existingTrip.country) ? existingTrip.country : [existingTrip.country], // 確保 country 是陣列
            folderName: allPhotos.length > 0 ? scannedTrip.folderName : "" // 更新 folderName
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
    const countryArray = Array.isArray(trip.country) ? trip.country : [trip.country];
    const tripKey = `${trip.year}_${countryArray.join('_')}`;
    const hasPhotos = trip.photo && Array.isArray(trip.photo) && trip.photo.length > 0;

    // 只有當行程有照片時才檢查資料夾是否存在
    if (hasPhotos && !trips[tripKey]) {
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
      country: trip.country, // 現在是陣列
      city: trip.cities,
      cityTW: trip.cities.slice(),
      stateTW: [],
      folderName: trip.photos.length > 0 ? trip.folderName : "", // 有照片才設定 folderName
      photo: trip.photos
    };
    templateData.newTrips.push(tripData);
  });

  // 處理更新行程
  updatedTrips.forEach(update => {
    const { tripKey, originalTrip, updatedTrip, newPhotos } = update;
    templateData.updatedTrips.push({
      tripKey: tripKey,
      displayName: getDisplayName(originalTrip),
      newPhotos: newPhotos,
      updatedRecord: updatedTrip
    });
  });

  // 處理被刪除的行程
  deletedTrips.forEach(deleted => {
    templateData.deletedTrips.push({
      tripKey: deleted.tripKey,
      displayName: getDisplayName(deleted.trip),
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
      photo: remainingPhotos,
      country: Array.isArray(originalTrip.country) ? originalTrip.country : [originalTrip.country], // 確保 country 是陣列
      folderName: remainingPhotos.length > 0 ? (originalTrip.folderName || "") : "" // 根據照片數量設定 folderName
    };

    templateData.tripsWithDeletedPhotos.push({
      tripKey: tripKey,
      displayName: getDisplayName(originalTrip),
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
      displayName: getDisplayName(originalTrip),
      addedCities: addedCities,
      fixedRecord: fixedTrip
    });
  });

  // 輔助函數：生成顯示名稱
  function getDisplayName(trip) {
    // 優先使用 cityTW，其次使用 city
    if (Array.isArray(trip.cityTW) && trip.cityTW.length > 0) {
      return trip.cityTW.join(', ');
    } else if (trip.cityTW && typeof trip.cityTW === 'string') {
      return trip.cityTW;
    } else if (Array.isArray(trip.city) && trip.city.length > 0) {
      return trip.city.join(', ');
    } else if (trip.city && typeof trip.city === 'string') {
      return trip.city;
    } else {
      // 如果沒有城市資訊，使用國家名稱
      const countries = Array.isArray(trip.country) ? trip.country : [trip.country];
      return countries.join(', ');
    }
  }

  // 更新最後掃描時間
  const lastScanPath = path.join(__dirname, '../data/last-scan.txt');
  const now = new Date();

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
    // 自定義 JSON 格式化，讓陣列顯示在同一行且無多餘空格
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
        return `${indent}"${key}": [${formattedItems}]`;
      });

    fs.writeFileSync(templatePath, jsonString, 'utf8');

    // 簡化的 console 輸出
    console.log('📊 掃描完成！');
    console.log('─────────────────────────────────────');

    if (newTrips.length > 0) {
      console.log(`✨ 發現 ${newTrips.length} 個新增行程`);
      newTrips.forEach(trip => {
        const countryNames = trip.country.join(', ');
        const cityNames = trip.cities.join(', ');
        console.log(`   - ${trip.year}_${trip.country.join('_')} (${countryNames}): ${cityNames}`);
      });
    }

    if (updatedTrips.length > 0) {
      console.log(`🔄 發現 ${updatedTrips.length} 個更新行程`);
      updatedTrips.forEach(update => {
        console.log(`   - ${update.tripKey} (${update.displayName}): +${update.newPhotos.length} 張照片`);
      });
    }

    if (deletedTrips.length > 0) {
      console.log(`🗑️  發現 ${deletedTrips.length} 個被刪除的行程`);
      deletedTrips.forEach(deleted => {
        console.log(`   - ${deleted.tripKey} (${deleted.displayName}): ${deleted.reason}`);
      });
    }

    if (tripsWithDeletedPhotos.length > 0) {
      console.log(`📸 發現 ${tripsWithDeletedPhotos.length} 個行程有照片被刪除`);
      tripsWithDeletedPhotos.forEach(deleted => {
        console.log(`   - ${deleted.tripKey} (${deleted.displayName}): -${deleted.deletedPhotos.length} 張照片`);
      });
    }

    if (tripsNeedCityFix.length > 0) {
      console.log(`🔧 發現 ${tripsNeedCityFix.length} 個行程需要修復城市欄位`);
      tripsNeedCityFix.forEach(fix => {
        console.log(`   - ${fix.tripKey} (${fix.displayName}): 添加城市 [${fix.addedCities.join(', ')}]`);
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