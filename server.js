// server.js
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const { google } = require('googleapis');
const path = require('path');

const app = express();
const upload = multer({ dest: 'uploads/' });

// Basic health check
app.get('/', (req, res) => res.send('YouTube uploader is running'));

// POST /uploadToYouTube
app.post('/uploadToYouTube', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No video file uploaded' });

    const title = req.body.title || 'Uploaded from app';
    const description = req.body.description || '';

    // Load OAuth info from environment variables
    const CLIENT_ID = process.env.YT_CLIENT_ID;
    const CLIENT_SECRET = process.env.YT_CLIENT_SECRET;
    const REDIRECT_URI = process.env.YT_REDIRECT_URI || 'urn:ietf:wg:oauth:2.0:oob';
    const REFRESH_TOKEN = process.env.YT_REFRESH_TOKEN;

    if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
      // Clean up file
      fs.unlinkSync(req.file.path);
      return res.status(500).json({ success: false, error: 'Missing YouTube OAuth environment variables' });
    }

    // Setup OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      CLIENT_ID,
      CLIENT_SECRET,
      REDIRECT_URI
    );
    oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

    // Upload video to YouTube
    const filePath = path.resolve(req.file.path);
    const response = await youtube.videos.insert({
      part: 'snippet,status',
      requestBody: {
        snippet: {
          title,
          description
        },
        status: {
          privacyStatus: 'public'
        }
      },
      media: {
        body: fs.createReadStream(filePath)
      }
    }, {
      // Set a high timeout for large files
      maxBodyLength: Infinity,
      maxContentLength: Infinity
    });

    // Remove temp file
    fs.unlinkSync(filePath);

    res.json({ success: true, videoId: response.data.id, data: response.data });
  } catch (err) {
    console.error('Upload error', err);
    // cleanup temp file if exists
    try { if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path); } catch (e) {}
    res.status(500).json({ success: false, error: err.message || String(err) });
  }
});

// Start server on Render's provided PORT or 3000 locally
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server listening on ${port}`));
