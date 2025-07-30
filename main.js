const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const fileUpload = require('express-fileupload');
const xlsx = require('xlsx');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = 'database.db';

app.use(express.static(__dirname));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload());

if (!fs.existsSync(DB_FILE)) {
    console.error("שגיאה: קובץ מסד הנתונים 'database.db' לא נמצא. \nייתכן שתהליך ההקמה הראשוני נכשל. בדוק את הלוגים.");
    // In a real server, we might want to exit, but let's let it run
    // to potentially serve the HTML page with an error.
}

// better-sqlite3 is synchronous, making the code cleaner.
const db = new Database(DB_FILE, { readonly: false });
console.log("מחובר למסד הנתונים SQLite.");

// API Endpoints
app.get('/api/data', (req, res) => {
    try {
        const branchesSql = `
            SELECT b.id, b.name, b.address, b.city, b.lat, b.lon, b.region_manager_id, rm.name as manager_name, rm.color 
            FROM branches b 
            LEFT JOIN region_managers rm ON b.region_manager_id = rm.id
        `;
        const managersSql = `SELECT * FROM region_managers`;

        const branches = db.prepare(branchesSql).all();
        const managers = db.prepare(managersSql).all();

        res.json({ branches, managers });
    } catch (err) {
        res.status(500).json({ error: "שגיאה בקבלת נתונים: " + err.message });
    }
});

app.post('/api/branches', (req, res) => {
    try {
        const { name, address, city, lat, lon, region_manager_id } = req.body;
        if (!name || !address || !city || !lat || !lon || !region_manager_id) {
            return res.status(400).json({ error: 'נא למלא את כל השדות.' });
        }
        const sql = `INSERT INTO branches (name, address, city, lat, lon, region_manager_id) VALUES (?, ?, ?, ?, ?, ?)`;
        const info = db.prepare(sql).run(name, address, city, lat, lon, region_manager_id);
        res.json({ message: "סניף נוסף בהצלחה!", id: info.lastInsertRowid });
    } catch (err) {
        res.status(400).json({ error: "שגיאה בהוספת הסניף: " + err.message });
    }
});

app.post('/api/managers', (req, res) => {
    try {
        const { name, color } = req.body;
        if (!name || !color) return res.status(400).json({ error: 'נא למלא את כל השדות.' });
        const sql = `INSERT INTO region_managers (name, color) VALUES (?, ?)`;
        const info = db.prepare(sql).run(name, color);
        res.json({ message: "מנהל נוסף בהצלחה!", id: info.lastInsertRowid });
    } catch (err) {
        res.status(400).json({ error: "שגיאה בהוספת המנהל: " + err.message });
    }
});

app.post('/api/delete/branch/:id', (req, res) => {
    try {
        const info = db.prepare(`DELETE FROM branches WHERE id = ?`).run(req.params.id);
        if (info.changes === 0) return res.status(404).json({ error: "סניף לא נמצא." });
        res.json({ message: "סניף נמחק בהצלחה!" });
    } catch (err) {
        res.status(400).json({ error: "שגיאה במחיקת הסניף: " + err.message });
    }
});

app.post('/api/delete/manager/:id', (req, res) => {
    try {
        const branchCount = db.prepare(`SELECT COUNT(*) as count FROM branches WHERE region_manager_id = ?`).get(req.params.id);
        if (branchCount.count > 0) {
            return res.status(400).json({ error: "לא ניתן למחוק מנהל שיש לו סניפים משויכים." });
        }
        const info = db.prepare(`DELETE FROM region_managers WHERE id = ?`).run(req.params.id);
        if (info.changes === 0) return res.status(404).json({ error: "מנהל לא נמצא." });
        res.json({ message: "מנהל נמחק בהצלחה!" });
    } catch (err) {
        res.status(500).json({ error: "שגיאה במחיקת המנהל: " + err.message });
    }
});

app.get('/api/recommendation/:branchId', (req, res) => {
    const { branchId } = req.params;
    let nextMonth = new Date().getMonth() + 2;
    if (nextMonth > 12) nextMonth = 1;
    const explanation = [];

    try {
        const baseSalesQuery = `SELECT AVG(actual_sales) as value FROM (SELECT actual_sales FROM sales_history WHERE branch_id = ? ORDER BY year DESC, month DESC LIMIT 3)`;
        const baseRow = db.prepare(baseSalesQuery).get(branchId);
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
            }
        } catch (e) {
             explanation.push(`שגיאה בטעינת מקדמי עונתיות.`);
        }
        
        const branchInfoQuery = `SELECT city FROM branches WHERE id = ?`;
        const branchRow = db.prepare(branchInfoQuery).get(branchId);
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

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.listen(PORT, () => console.log(`השרת רץ על http://localhost:${PORT}`));