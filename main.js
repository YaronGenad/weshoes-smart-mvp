const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fileUpload = require('express-fileupload');
const xlsx = require('xlsx');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = 'database.db';

// Middleware
app.use(express.static(__dirname));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload());

// Initialize database
if (!fs.existsSync(DB_FILE)) {
    console.error("שגיאה: קובץ מסד הנתונים 'database.db' לא נמצא. \nאנא הרץ 'npm run setup' תחילה כדי ליצור ולטעון את הנתונים.");
    process.exit(1);
}
const db = new sqlite3.Database(DB_FILE, sqlite3.OPEN_READWRITE, (err) => {
    if (err) console.error("שגיאה בפתיחת מסד הנתונים:", err.message);
    else console.log("מחובר למסד הנתונים SQLite.");
});

// API Endpoints
app.get('/api/data', (req, res) => {
    const data = { branches: [], managers: [] };
    db.all(`SELECT b.id, b.name, b.address, b.city, b.lat, b.lon, b.region_manager_id, rm.name as manager_name, rm.color 
            FROM branches b LEFT JOIN region_managers rm ON b.region_manager_id = rm.id`, [], (err, branchesRows) => {
        if (err) return res.status(500).json({ error: "שגיאה בקבלת נתוני סניפים: " + err.message });
        data.branches = branchesRows;
        db.all(`SELECT * FROM region_managers`, [], (err, managersRows) => {
            if (err) return res.status(500).json({ error: "שגיאה בקבלת נתוני מנהלים: " + err.message });
            data.managers = managersRows;
            res.json(data);
        });
    });
});

app.post('/api/branches', (req, res) => {
    const { name, address, city, lat, lon, region_manager_id } = req.body;
    if (!name || !address || !city || !lat || !lon || !region_manager_id) {
        return res.status(400).json({ error: 'נא למלא את כל השדות.' });
    }
    const sql = `INSERT INTO branches (name, address, city, lat, lon, region_manager_id) VALUES (?, ?, ?, ?, ?, ?)`;
    db.run(sql, [name, address, city, lat, lon, region_manager_id], function(err) {
        if (err) return res.status(400).json({ error: "שגיאה בהוספת הסניף: " + err.message });
        res.json({ message: "סניף נוסף בהצלחה!", id: this.lastID });
    });
});

app.post('/api/managers', (req, res) => {
    const { name, color } = req.body;
    if (!name || !color) return res.status(400).json({ error: 'נא למלא את כל השדות.' });
    const sql = `INSERT INTO region_managers (name, color) VALUES (?, ?)`;
    db.run(sql, [name, color], function(err) {
        if (err) return res.status(400).json({ error: "שגיאה בהוספת המנהל: " + err.message });
        res.json({ message: "מנהל נוסף בהצלחה!", id: this.lastID });
    });
});

app.post('/api/delete/branch/:id', (req, res) => {
    db.run(`DELETE FROM branches WHERE id = ?`, req.params.id, function(err) {
        if (err) return res.status(400).json({ error: "שגיאה במחיקת הסניף: " + err.message });
        res.json({ message: "סניף נמחק בהצלחה!" });
    });
});

app.post('/api/delete/manager/:id', (req, res) => {
    db.get(`SELECT COUNT(*) as count FROM branches WHERE region_manager_id = ?`, [req.params.id], (err, row) => {
        if(err) return res.status(500).json({ error: "שגיאה בבדיקת סניפים משויכים: " + err.message });
        if (row.count > 0) return res.status(400).json({ error: "לא ניתן למחוק מנהל שיש לו סניפים משויכים." });
        
        db.run(`DELETE FROM region_managers WHERE id = ?`, req.params.id, function(err) {
            if (err) return res.status(400).json({ error: "שגיאה במחיקת המנהל: " + err.message });
            res.json({ message: "מנהל נמחק בהצלחה!" });
        });
    });
});

app.post('/upload', (req, res) => {
    if (!req.files || Object.keys(req.files).length === 0) {
        return res.status(400).json({error: 'לא נבחר קובץ.'});
    }

    const excelFile = req.files.excelFile;
    const workbook = xlsx.read(excelFile.data, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet);
    
    // UPSERT logic - assuming structure from previous steps
    // This is a placeholder for a more complex sales data upload
    res.json({ message: `הקובץ ${excelFile.name} הועלה, עיבוד נתונים לא מומש עדיין.` });
});


app.get('/api/recommendation/:branchId', (req, res) => {
    const { branchId } = req.params;
    let nextMonth = new Date().getMonth() + 2; // +1 to get 1-12, +1 for next month
    if (nextMonth > 12) nextMonth = 1;
    const explanation = [];

    const queries = {
        base_sales: `SELECT AVG(actual_sales) as value FROM (SELECT actual_sales FROM sales_history WHERE branch_id = ? ORDER BY year DESC, month DESC LIMIT 3)`,
        branch_info: `SELECT city FROM branches WHERE id = ?`,
    };

    db.get(queries.base_sales, [branchId], (err, baseRow) => {
        if (err) return res.status(500).json({ error: err.message });
        let baseSales = baseRow.value || 0;
        
        if (baseSales > 0) {
             explanation.push(`ביצועי הבסיס (ממוצע 3 חודשים אחרונים) הם <b>${Math.round(baseSales).toLocaleString()} ₪</b>.`);
        } else {
            explanation.push(`לא נמצאו נתוני מכירות היסטוריים לסניף זה. הבסיס נקבע על 50,000 ₪.`);
            baseSales = 50000;
        }

        let seasonalFactor = 1;
        try {
            const externalFactors = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'external_factors.json')));
            const monthFactorData = externalFactors.monthly_seasonality.find(m => m.month === nextMonth);
            if(monthFactorData){
                seasonalFactor = monthFactorData.factor;
                explanation.push(`החודש הבא (חודש ${nextMonth}) הוא חודש עם מקדם עונתיות של <b>x${seasonalFactor}</b>. סיבה: ${monthFactorData.reason}.`);
            } else {
                explanation.push(`לא נמצא מקדם עונתיות לחודש הבא.`);
            }
        } catch (e) {
             explanation.push(`שגיאה בטעינת מקדמי עונתיות.`);
        }


        db.get(queries.branch_info, [branchId], (err, branchRow) => {
            if (err) return res.status(500).json({ error: err.message });
            let demographicFactor = 1;
            if(branchRow) {
                try {
                    const demographics = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'demographic_data.json')));
                    const cityData = demographics.cities.find(c => c.city === branchRow.city);
                    const allCitiesSocio = demographics.cities.map(c => c.socioeconomic_status).filter(s => s > 0);
                    const avgSocio = allCitiesSocio.reduce((acc, c) => acc + c, 0) / allCitiesSocio.length;
                    
                    if (cityData && avgSocio > 0) {
                        demographicFactor = 1 + ((cityData.socioeconomic_status - avgSocio) / avgSocio) * 0.25; // השפעה מתונה
                        explanation.push(`הדירוג הסוציו-אקונומי של ${branchRow.city} (${cityData.socioeconomic_status}) מביא למקדם דמוגרפי של <b>x${demographicFactor.toFixed(2)}</b>.`);
                    }
                } catch(e) {
                     explanation.push(`שגיאה בטעינת נתונים דמוגרפיים.`);
                }
            }

            const recommendation = baseSales * seasonalFactor * demographicFactor;
            explanation.push(`<b>היעד הסופי חושב לפי:</b> ${Math.round(baseSales).toLocaleString()} (בסיס) * ${seasonalFactor.toFixed(2)} (עונתיות) * ${demographicFactor.toFixed(2)} (דמוגרפיה)`);
            
            res.json({ 
                recommendation: Math.round(recommendation),
                explanation: explanation.join('<br>')
            });
        });
    });
});


app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.listen(PORT, () => console.log(`השרת רץ על http://localhost:${PORT}`));