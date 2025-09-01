// server.js
// This is the "brain" of your application.

// Import necessary libraries
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, addDoc, getDocs } = require('firebase/firestore');
const { getStorage, ref, uploadBytes } = require('firebase/storage'); // For file storage
const multer = require('multer'); // For handling file uploads

// --- CONFIGURATION ---
// Load environment variables (for API keys)
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000; // Try to use the port Google Cloud gives you (process.env.PORT). If you can't find one, then just use 3000.

// Your Firebase configuration object (replace with your actual config)
const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    // ... other config values
};

// Initialize Firebase and Gemini
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const storage = getStorage(firebaseApp); // Initialize Firebase Storage
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-pro" });

// --- MIDDLEWARE ---
app.use(express.json());
const cors = require('cors');
app.use(cors());

// Configure Multer for in-memory file storage with a 100MB limit
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
});


// --- API ENDPOINTS ---

// 1. Endpoint to Generate a Meal Plan
app.post('/generate-plan', async (req, res) => {
    try {
        const { cookbook, dietaryNeeds, specialRequests, template } = req.body;

        // NOTE: For newly uploaded PDFs, a more advanced integration is needed for Gemini to read the file contents.
        // This current prompt relies on Gemini's existing knowledge of the cookbook's name.
        const prompt = `
            Using the following meal plan as a template:
            --- TEMPLATE START ---
            ${template}
            --- TEMPLATE END ---

            Create a new one-week meal plan for a single person with the following changes:
            1. Cookbook: ${cookbook}
            2. Dietary Needs: ${dietaryNeeds}
            3. Special Requests: ${specialRequests}

            Respond ONLY with the complete, updated markdown for the new meal plan file. Do not include any other text or explanation.
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        res.json({ success: true, mealPlan: text });

    } catch (error) {
        console.error("Error generating plan:", error);
        res.status(500).json({ success: false, message: "Failed to generate meal plan." });
    }
});

// 2. Endpoint to Save a Favorite Plan
app.post('/favorites', async (req, res) => {
    try {
        const { mealPlanMarkdown } = req.body;
        if (!mealPlanMarkdown) {
            return res.status(400).json({ success: false, message: "No meal plan content provided." });
        }
        const docRef = await addDoc(collection(db, "favorites"), {
            createdAt: new Date(),
            content: mealPlanMarkdown
        });
        res.json({ success: true, id: docRef.id });
    } catch (error) {
        console.error("Error saving favorite:", error);
        res.status(500).json({ success: false, message: "Failed to save favorite." });
    }
});

// 3. Endpoint to Get All Favorite Plans
app.get('/favorites', async (req, res) => {
    try {
        const favoritesCol = collection(db, 'favorites');
        const favoritesSnapshot = await getDocs(favoritesCol);
        const favoritesList = favoritesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json({ success: true, favorites: favoritesList });
    } catch (error) {
        console.error("Error fetching favorites:", error);
        res.status(500).json({ success: false, message: "Failed to fetch favorites." });
    }
});

// 4. Endpoint to Upload a New Cookbook
app.post('/upload-cookbook', upload.single('cookbookFile'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: "No file uploaded." });
        }
        const file = req.file;
        const storageRef = ref(storage, `cookbooks/${Date.now()}_${file.originalname}`);
        await uploadBytes(storageRef, file.buffer, { contentType: file.mimetype });
        await addDoc(collection(db, "cookbooks"), {
            name: file.originalname,
            storagePath: storageRef.fullPath,
            uploadedAt: new Date(),
        });
        res.json({ success: true, message: "Cookbook uploaded successfully." });
    } catch (error) {
        console.error("Error uploading cookbook:", error);
        res.status(500).json({ success: false, message: "Failed to upload cookbook." });
    }
});

// 5. Endpoint to Get All Uploaded Cookbooks
app.get('/cookbooks', async (req, res) => {
    try {
        const cookbooksCol = collection(db, 'cookbooks');
        const snapshot = await getDocs(cookbooksCol);
        const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json({ success: true, cookbooks: list });
    } catch (error) {
        console.error("Error fetching cookbooks:", error);
        res.status(500).json({ success: false, message: "Failed to fetch cookbooks." });
    }
});

// --- START SERVER ---
app.listen(port, () => {
    console.log(`Meal Planner backend listening at http://localhost:${port}`);
});