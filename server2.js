const express = require("express");
const fs = require("fs");
const bodyParser = require("body-parser");
const cors = require("cors");

const app = express();
const port = 5002;
const filePath = "health_data.json";
const path = require("path");

const dataFilePath = path.join(__dirname, "health_data.json");

app.use(bodyParser.json());
app.use(cors());

// Load health data from file
function loadHealthData() {
    try {
        const rawData = fs.readFileSync(dataFilePath);
        return JSON.parse(rawData);
    } catch (error) {
        console.error("Error reading health data file:", error);
        return [];
    }
}

// Save health data to file
function saveHealthData(data) {
    fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2));
}

// POST: Log new health data
app.post("/api/health", (req, res) => {
    let healthData = loadHealthData();
    const newEntry = {
        user_id: req.body.user_id,  // Include user_id
        date: new Date().toISOString().split("T")[0],
        ...req.body
    };
    healthData.push(newEntry);
    saveHealthData(healthData);
    res.status(201).json(newEntry);
});

// GET: Fetch all health records for a specific user
app.get("/api/health", (req, res) => {
    const userId = req.query.user_id; // Retrieve user_id from query parameters
    const healthData = loadHealthData().filter(entry => entry.user_id === userId);
    res.status(200).json(healthData);
});

// GET: Fetch analysis for a specific user
app.get("/api/health/analysis/:userId", (req, res) => {
    const userId = req.params.userId;
    const data = loadHealthData().filter(entry => entry.user_id === userId);

    // If there are fewer than 8 entries, return the available data
    const lastEntries = data.slice(-8);

    if (lastEntries.length < 2) {
        return res.status(400).json({ message: "Not enough data for analysis." });
    }

    const analysisData = {};

    lastEntries.forEach(entry => {
        if (!analysisData[entry.date]) {
            analysisData[entry.date] = {
                bp: [],
                sugar: [],
                heartRate: [],
            };
        }
        analysisData[entry.date].bp.push(parseInt(entry.bp));
        analysisData[entry.date].sugar.push(parseInt(entry.sugar));
        analysisData[entry.date].heartRate.push(parseInt(entry.heartRate));
    });

    const result = Object.keys(analysisData).map(date => ({
        date,
        avg_bp: analysisData[date].bp.reduce((a, b) => a + b, 0) / analysisData[date].bp.length,
        avg_sugar: analysisData[date].sugar.reduce((a, b) => a + b, 0) / analysisData[date].sugar.length,
        avg_heartRate: analysisData[date].heartRate.reduce((a, b) => a + b, 0) / analysisData[date].heartRate.length,
    }));

    res.status(200).json(result);
});

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
