const express = require('express');
const { Pool } = require('pg');
const bodyParser = require('body-parser');
const cors = require('cors');
const twilio = require("twilio");
const cron = require("node-cron");
const bcrypt = require("bcrypt");


const app = express();
const port = 3000;

app.use(bodyParser.json());
app.use(cors());


const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'postgres', 
    password: 'root', 
    port: 5432,
});

// Signup Route
app.post("/signup", async (req, res) => {
    const { name, email, password } = req.body;
    
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await pool.query(
            "INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id, name, email",
            [name, email, hashedPassword]
        );

        res.status(201).json({ message: "User registered successfully", user: result.rows[0] });
    } catch (error) {
        res.status(500).json({ error: "Error registering user" });
    }
});

// Login Route
app.post("/login", async (req, res) => {
    const { email, password } = req.body;

    try {
        const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);

        if (result.rows.length === 0) {
            return res.status(400).json({ error: "User not found" });
        }

        const user = result.rows[0];
        const passwordMatch = await bcrypt.compare(password, user.password);

        if (!passwordMatch) {
            return res.status(401).json({ error: "Incorrect password" });
        }

        res.json({ message: "Login successful", userId: user.id });
    } catch (error) {
        res.status(500).json({ error: "Error logging in" });
    }
});

app.get('/api/medications', async (req, res) => {
    const userId = req.query.userId;

    if (!userId) {
        return res.status(401).json({ error: "Unauthorized: User ID required" });
    }

    try {
        const result = await pool.query(
            'SELECT id, medicine_name, num_tablets, tablets_per_day, string_to_array(time_of_day, \',\') AS time_of_day FROM medications WHERE user_id = $1',
            [userId]
        );
        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Database error" });
    }
});


// API to add medication
app.post('/api/medications', async (req, res) => {
    const { medicineName, numTablets, tabletsPerDay, timeOfDay, userId } = req.body;

    if (!medicineName || !numTablets || !tabletsPerDay || !timeOfDay || timeOfDay.length === 0 || !userId) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    try {
        const result = await pool.query(
            'INSERT INTO medications (medicine_name, num_tablets, tablets_per_day, time_of_day, user_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [medicineName, numTablets, tabletsPerDay, timeOfDay.join(', '), userId]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error inserting medication:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.delete('/api/medications/:id', async (req, res) => {
    const { id } = req.params;
    const { userId } = req.query;

    if (!userId) {
        return res.status(401).json({ error: "Unauthorized: User ID required" });
    }

    try {
        const checkMedication = await pool.query(
            'SELECT * FROM medications WHERE id = $1 AND user_id = $2',
            [id, userId]
        );

        if (checkMedication.rows.length === 0) {
            return res.status(404).json({ error: "Medication not found" });
        }
        await pool.query('DELETE FROM medications WHERE id = $1', [id]);

        res.json({ message: "Medication deleted successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to delete medication" });
    }
});

// Route for setting a reminder
app.post('/api/reminders', async (req, res) => {
    const { medicationId, reminderTime } = req.body;

    try {
        // Validate reminderTime format
        const parsedTime = new Date(reminderTime).toISOString();
        if (!parsedTime) {
            return res.status(400).json({ error: 'Invalid reminder time format' });
        }

        const result = await pool.query(
            'INSERT INTO reminders (medication_id, reminder_time) VALUES ($1, $2)',
            [medicationId, parsedTime]
        );
        res.status(200).json({ message: 'Reminder set successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to set reminder' });
    }
});

app.get('/api/checkReminders', async (req, res) => {
    const { time } = req.query;

    try {
        const currentTime = new Date(time).toISOString();
        const oneMinuteAgo = new Date(new Date(time) - 60000).toISOString();

        const result = await pool.query(
            'SELECT reminders.*, medications.medicine_name FROM reminders ' +
            'JOIN medications ON reminders.medication_id = medications.id ' +
            'WHERE reminder_time BETWEEN $1 AND $2',
            [oneMinuteAgo, currentTime]
        );

        res.status(200).json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to check reminders' });
    }
});


const accountSid = ""; // Get from Twilio
const authToken = "";  // Get from Twilio
const twilioClient = twilio(accountSid, authToken);
const twilioNumber = ""; // Twilio phone number

// API to send SOS SMS
app.post("/api/send-sos", async (req, res) => {
    const { contacts, location } = req.body;
    const sosMessage = `User in🚨 Emergency! Please help!🚨\nLocation: ${location || "Location unavailable"}`;

    try {
        // Send SMS to each emergency contact
        for (const contact of contacts) {
            await twilioClient.messages.create({
                body: sosMessage,
                from: twilioNumber,
                to: contact
            });
        }
        res.json({ success: true, message: "SOS messages sent!" });
    } catch (error) {
        console.error("Twilio Error:", error);
        res.status(500).json({ error: "Failed to send SOS message" });
    }
});


app.get("/api/activities", async (req, res) => {
    const { user_id } = req.query; 
    if (!user_id) {
        return res.status(400).send("User ID is required!");
    }

    try {
        const result = await pool.query(
            "SELECT * FROM daily_activities WHERE user_id = $1 ORDER BY id ASC", 
            [user_id]
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).send("Error fetching activities.");
    }
});

app.post("/api/add-activity", async (req, res) => {
    const { task, duration, user_id } = req.body;
    if (!user_id) {
        return res.status(400).send("User ID is required!");
    }

    try {
        await pool.query(
            "INSERT INTO daily_activities (task, duration, user_id) VALUES ($1, $2, $3)", 
            [task, duration, user_id]
        );
        res.json({ success: true, message: "Activity added!" });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error adding activity.");
    }
});



app.post("/api/complete-activity", async (req, res) => {
    const { id, user_id } = req.body; 
    try {
        await pool.query(
            "UPDATE daily_activities SET completed = TRUE WHERE id = $1 AND user_id = $2", 
            [id, user_id]
        );
        res.json({ success: true, message: "Activity marked as completed!" });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error updating activity.");
    }
});



cron.schedule("*/5 * * * *", async () => {
    console.log("Resetting activities...");
    try {
        await pool.query("DELETE FROM daily_activities WHERE completed = TRUE");
        console.log("Completed activities reset successfully!");
    } catch (err) {
        console.error("Error resetting activities:", err);
    }
});

app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
