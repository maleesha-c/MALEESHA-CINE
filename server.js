const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const crypto = require('crypto');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB Connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/maleesha_cine_hub';
mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB Connected Successfully!'))
    .catch(err => console.log('MongoDB Connection Error:', err));

// User Schema & Model
const userSchema = new mongoose.Schema({
    uid: { type: String, unique: true },
    name: String,
    email: { type: String, unique: true },
    apiKey: { type: String, unique: true },
    plan: { type: String, default: 'Free Tier' },
    usedQuota: { type: Number, default: 15 },
    totalQuota: { type: Number, default: 200 },
    coins: { type: Number, default: 6 }
});

const User = mongoose.model('User', userSchema);

// --- API ROUTES ---

// 1. Get User Profile / Dashboard Data
app.get('/api/user/profile', async (req, res) => {
    try {
        let user = await User.findOne({ email: 'maleeshapoddairc@gmail.com' });
        if (!user) {
            user = new User({
                uid: 'g_' + Math.floor(Math.random() * 100000000000000000),
                name: 'Maleesha Poddairc',
                email: 'maleeshapoddairc@gmail.com',
                apiKey: 'maleesha_api_' + crypto.randomBytes(16).toString('hex'),
                plan: 'Free Tier',
                usedQuota: 15,
                totalQuota: 200,
                coins: 6
            });
            await user.save();
        }
        res.json({ status: true, user });
    } catch (error) {
        res.status(500).json({ status: false, message: error.message });
    }
});

// 2. Regenerate API Key
app.post('/api/user/regenerate', async (req, res) => {
    try {
        const newApiKey = 'maleesha_api_' + crypto.randomBytes(16).toString('hex');
        const user = await User.findOneAndUpdate(
            { email: 'maleeshapoddairc@gmail.com' },
            { apiKey: newApiKey },
            { new: true }
        );
        res.json({ status: true, apiKey: user.apiKey });
    } catch (error) {
        res.status(500).json({ status: false, message: error.message });
    }
});

// 3. Protected Movie Search API
app.get('/api/v1/search', async (req, res) => {
    const apiKey = req.headers['x-api-key'] || req.query.apikey;
    const query = req.query.q;

    if (!apiKey) {
        return res.status(401).json({ status: false, message: 'API Key එක අවශ්‍ය වේ! (?apikey=... හෝ Headers වල x-api-key දමන්න)' });
    }

    const user = await User.findOne({ apiKey });
    if (!user) {
        return res.status(403).json({ status: false, message: 'අවලංගු (Invalid) API Key එකකි!' });
    }

    // Quota and Coins Deduction Logic
    if (user.usedQuota < user.totalQuota) {
        user.usedQuota += 1;
    } else if (user.coins > 0) {
        user.coins -= 1;
    } else {
        return res.status(429).json({ 
            status: false, 
            message: 'ඔබගේ Free Quota සහ Coins සියල්ල අවසන්! කරුණාකර Top-up කරගන්න.' 
        });
    }

    await user.save();

    try {
        const searchUrl = `https://cinesubz.co/?s=${encodeURIComponent(query || '')}`;
        const { data } = await axios.get(searchUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        const $ = cheerio.load(data);
        const results = [];

        $('.result-item, article, .item').each((index, element) => {
            const title = $(element).find('.title a, h2 a, .entry-title a').text().trim();
            const link = $(element).find('.title a, h2 a, .entry-title a').attr('href');
            // නිවැරදි කළ Image URL extraction කොටස
            const image = $(element).find('img').attr('src') \vert{}\vert{}$(element).find('img').attr('data-src');

            if (title && link) {
                results.push({ title, link, image });
            }
        });

        res.json({
            status: true,
            provider: 'Maleesha Cine Hub',
            remaining_quota: user.totalQuota - user.usedQuota,
            remaining_coins: user.coins,
            results_count: results.length,
            results
        });

    } catch (error) {
        res.status(500).json({ status: false, message: 'Scraping Error', error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Maleesha Cine Hub API Server is running on http://localhost:${PORT}`);
});
