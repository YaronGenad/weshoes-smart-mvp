const sqlite3 = require('sqlite3').verbose();
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

const DB_FILE = 'database.db';
const branchDataFile = 'branch.csv';

// מחיקת קובץ מסד נתונים ישן אם קיים כדי להבטיח טעינה נקייה
if (fs.existsSync(DB_FILE)) {
    fs.unlinkSync(DB_FILE);
    console.log(`קובץ מסד נתונים קודם (${DB_FILE}) נמחק. מתחיל טעינה חדשה.`);
}

const db = new sqlite3.Database(DB_FILE);

function readCsv(filePath) {
    try {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const cleanContent = fileContent.startsWith('\uFEFF') ? fileContent.substring(1) : fileContent;
        const workbook = xlsx.read(cleanContent, { type: 'string' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        return xlsx.utils.sheet_to_json(sheet);
    } catch (error) {
        console.error(`שגיאה בקריאת קובץ ${filePath}: ${error.message}`);
        return [];
    }
}

function getCoords(city) {
    const cleanCity = city.replace(/"/g, '').trim();
    const coords = {
        'תל אביב': { lat: 32.0853, lon: 34.7818 },
        'ת"א': { lat: 32.0853, lon: 34.7818 },
        'ירושלים': { lat: 31.7683, lon: 35.2137 },
        'ירושליים': { lat: 31.7683, lon: 35.2137 },
        'חיפה': { lat: 32.7940, lon: 34.9896 },
        'נתניה': { lat: 32.3215, lon: 34.8532 },
        'אילת': { lat: 29.5577, lon: 34.9519 },
        'זכרון יעקוב': { lat: 32.5723, lon: 34.9535 },
        'עפולה': { lat: 32.6085, lon: 35.2891 },
        'רחובות': { lat: 31.8928, lon: 34.8113 },
        'אשדוד': { lat: 31.7917, lon: 34.6434 },
        'קרית אונו': { lat: 32.0593, lon: 34.8554 },
        'רעננה': { lat: 32.1844, lon: 34.8712 },
        'הרצליה': { lat: 32.1668, lon: 34.8432 },
        'באר שבע': { lat: 31.2530, lon: 34.7915 },
        'מודיעין': { lat: 31.9038, lon: 35.0084 },
        'כפר סבא': { lat: 32.1760, lon: 34.9080 },
        'ראשון לציון': { lat: 31.9730, lon: 34.7925 },
        'ראשל"צ': { lat: 31.9730, lon: 34.7925 },
        'קרית אתא': { lat: 32.8093, lon: 35.1105 },
        'טבריה': { lat: 32.7933, lon: 35.5333 },
        'דימונה': { lat: 31.0694, lon: 35.0336 },
        'חולון': { lat: 32.0152, lon: 34.7722 },
        'רמת גן': { lat: 32.0826, lon: 34.8094 },
        'ר"ג': { lat: 32.0826, lon: 34.8094 },
        'פתח תקווה': { lat: 32.0921, lon: 34.8845 },
        'פ"ת': { lat: 32.0921, lon: 34.8845 },
        'נוף הגליל': { lat: 32.7027, lon: 35.3023 },
        'נצרת עילית': { lat: 32.7027, lon: 35.3023 },
        'נצרת': { lat: 32.701, lon: 35.295 },
        'חוצות המפרץ': { lat: 32.812, lon: 35.068 },
        'קרית ביאליק': { lat: 32.836, lon: 35.087 },
        'שדרות': { lat: 31.526, lon: 34.594 },
        'אור יהודה': { lat: 32.029, lon: 34.851 },
        'קריית שדה התעופה': { lat: 32.009, lon: 34.885 },
        'שפיים': { lat: 32.235, lon: 34.823 },
        'מרום נוה': { lat: 32.075, lon: 34.832 },
        'יקנעם עילית': { lat: 32.658, lon: 35.110 },
        'קדימה צורן': { lat: 32.296, lon: 34.918 },
        'צמח': { lat: 32.695, lon: 35.586 },
        'בית חנינה': { lat: 31.831, lon: 35.218 },
        'ראש פינה': { lat: 32.969, lon: 35.545 },
        'טייבה': { lat: 32.266, lon: 35.009 },
        'שער בנימין': { lat: 31.884, lon: 35.259 },
        'בארות יצחק': { lat: 32.046, lon: 34.887 },
        'מעלה אדומים': { lat: 31.773, lon: 35.312 },
        'מעלה אומים': { lat: 31.773, lon: 35.312 },
        // *** התיקון כאן ***
        "באקה אלג'רביה": { lat: 32.417, lon: 35.045 },
        'ים המלח': { lat: 31.198, lon: 35.362 },
        'ערד': { lat: 31.258, lon: 35.212 },
        'כרמי גת': { lat: 31.614, lon: 34.827 },
        'רהט': { lat: 31.395, lon: 34.756 },
        'באר יעקב': { lat: 31.936, lon: 34.837 },
        'קרית גת': { lat: 31.609, lon: 34.774 },
        'יהוד מונסון': { lat: 32.030, lon: 34.889 },
        'כפר החורש': { lat: 32.684, lon: 35.275 },
        'מעלות': { lat: 33.016, lon: 35.275 },
        'פסגת זאב': { lat: 31.832, lon: 35.242 },
        'רגבה': { lat: 32.983, lon: 35.110 },
        'מצפה רמון': { lat: 30.610, lon: 34.801 },
        'גן יבנה': { lat: 31.782, lon: 34.706 },
        'בית שמש': { lat: 31.724, lon: 34.988 },
        'כרמיאל': { lat: 32.915, lon: 35.295 },
        'קרית עקרון': { lat: 31.865, lon: 34.818 },
        'בני-ברק': { lat: 32.086, lon: 34.831 },
        'קרית חיים': { lat: 32.825, lon: 35.068 },
        'גבעתיים': { lat: 32.072, lon: 34.811 },
        'קרית שמונה': { lat: 33.208, lon: 35.570 },
        'ירכא': { lat: 32.956, lon: 35.212 },
        'פרדס חנה כרכור': { lat: 32.474, lon: 34.972 },
        'פדרס חנה כרכור': { lat: 32.474, lon: 34.972 },
        'דליית אל כרמל': { lat: 32.691, lon: 35.050 },
        'נהריה': { lat: 33.007, lon: 35.093 },
        'הוד השרון': { lat: 32.152, lon: 34.891 },
        'מבשרת ציון': { lat: 31.802, lon: 35.158 },
        'טמרה': { lat: 32.853, lon: 35.197 },
        'סחנין': { lat: 32.860, lon: 35.295 },
        'אשקלון': { lat: 31.669, lon: 34.571 },
        'מגדל': { lat: 32.855, lon: 35.518 },
        'חדרה': { lat: 32.434, lon: 34.919 },
        'גלילות': { lat: 32.153, lon: 34.814 },
        'בת ים': { lat: 32.021, lon: 34.752 }
    };

    let foundCityKey = Object.keys(coords).find(key => key === cleanCity);
    if (!foundCityKey) {
        foundCityKey = Object.keys(coords).find(key => key.includes(cleanCity));
    }

    if (foundCityKey) {
        return coords[foundCityKey];
    } else {
        console.warn(`\x1b[33m%s\x1b[0m`, `אזהרה: לא נמצאו קואורדינטות עבור העיר '${cleanCity}'. הסניף ימוקם בברירת המחדל.`);
        return { lat: 31.0461, lon: 34.8516 };
    }
}

db.serialize(() => {
    console.log("יוצר טבלאות...");
    db.run(`CREATE TABLE region_managers (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, color TEXT NOT NULL)`);
    db.run(`CREATE TABLE branches (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, address TEXT, city TEXT, lat REAL, lon REAL, region_manager_id INTEGER, FOREIGN KEY (region_manager_id) REFERENCES region_managers(id))`);
    db.run(`CREATE TABLE sales_history (id INTEGER PRIMARY KEY, branch_id INTEGER, year INTEGER, month INTEGER, actual_sales REAL, target_sales REAL, FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE, UNIQUE(branch_id, year, month))`);

    const branchesRaw = readCsv(branchDataFile);
    if (branchesRaw.length === 0) {
        console.error("קובץ הסניפים ריק או לא נמצא. התהליך נעצר.");
        return;
    }
    const managers = [...new Set(branchesRaw.map(b => b['מנהל איזור']).filter(Boolean))];
    
    const managerColorMap = ['#e6194B', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#911eb4', '#42d4f4', '#f032e6', '#bfef45', '#fabed4', '#aaffc3', '#ffd8b1'];
    
    const managerStmt = db.prepare(`INSERT INTO region_managers (name, color) VALUES (?, ?)`);
    managers.forEach((name, i) => {
        const color = managerColorMap[i % managerColorMap.length];
        managerStmt.run(name, color);
    });
    managerStmt.finalize(() => {
        console.log(`${managers.length} מנהלים נטענו.`);
        loadBranches();
    });
});

function loadBranches() {
    const branchesRaw = readCsv(branchDataFile);
    const branchStmt = db.prepare(`INSERT OR IGNORE INTO branches (name, address, city, lat, lon, region_manager_id) VALUES (?, ?, ?, ?, ?, ?)`);
    
    db.all(`SELECT id, name FROM region_managers`, [], (err, managerRows) => {
        if (err) {
            console.error("שגיאה בקבלת מנהלים מה-DB:", err.message);
            return;
        }
        const managerIdMap = managerRows.reduce((acc, row) => {
            acc[row.name] = row.id;
            return acc;
        }, {});

        branchesRaw.forEach(b => {
            const branchName = (b['תאור הסניף'] || '').trim().replace(/"/g, ''); 
            const city = (b['עיר'] || '').trim();
            const address = (b['כתובת'] || '').trim();
            const managerName = (b['מנהל איזור'] || '').trim();
            const managerId = managerIdMap[managerName];
            const coords = getCoords(city);

            if (branchName) {
                branchStmt.run(branchName, address, city, coords.lat, coords.lon, managerId, (err) => {
                    if (err) console.error(`שגיאה בהוספת סניף ${branchName}:`, err.message);
                });
            }
        });

        branchStmt.finalize(() => {
            console.log(`${branchesRaw.length} סניפים נטענו.`);
            loadSalesData();
        });
    });
}

function loadSalesData() {
    db.all(`SELECT id, name FROM branches`, [], (err, branches) => {
        if (err) return console.error(err.message);
        
        const branchNameIdMap = branches.reduce((acc, b) => {
            acc[b.name.trim()] = b.id;
            return acc;
        }, {});

        const salesStmt = db.prepare(`INSERT OR IGNORE INTO sales_history (branch_id, year, month, actual_sales, target_sales) VALUES (?, ?, ?, ?, ?)`);
        
        const salesFiles = { 1: 'January.csv', 2: 'February.csv', 3: 'March.csv', 4: 'April.csv', 5: 'May.csv', 6: 'June.csv', 7: 'July.csv' };

        let totalSalesRows = 0;
        Object.entries(salesFiles).forEach(([month, file]) => {
            const filePath = path.join(__dirname, file);
            if (fs.existsSync(filePath)) {
                const salesData = readCsv(filePath);
                salesData.forEach(row => {
                    const branchName = (row['סניף'] || '').trim().replace(/"/g, '');
                    const branchId = branchNameIdMap[branchName];
                    let actualSales = row['ביצוע מכירות חודשי כולל מעמ'];
                    let targetSales = row['יעד עד סוף החודש'];
                    
                    if (typeof actualSales === 'string') actualSales = parseFloat(actualSales.replace(/,/g, ''));
                    if (typeof targetSales === 'string') targetSales = parseFloat(targetSales.replace(/,/g, ''));

                    if (branchId && !isNaN(actualSales) && !isNaN(targetSales)) {
                        salesStmt.run(branchId, 2024, parseInt(month), actualSales, targetSales, (err) => {
                             if (!err) totalSalesRows++;
                        });
                    }
                });
                console.log(`קובץ ${file} עובד...`);
            }
        });

        salesStmt.finalize(() => console.log(`${totalSalesRows} רשומות מכירות היסטוריות נטענו. המערכת מוכנה להפעלה.`));
    });
}