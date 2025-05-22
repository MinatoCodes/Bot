 const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { tiktok } = require("@mrnima/tiktok-downloader");
const { facebook } = require("@mrnima/facebook-downloader");
const { instagram } = require("@mrnima/instagram-downloader");
const ytdl = require("@distube/ytdl-core");

module.exports = {
  config: {
    name: "autolink",
    version: "5.5", // Version incremented to reflect new packages and Pinterest removal
    author: "Lord Itachi",
    shortDescription: "Automatically download all available media from TikTok, Instagram, YouTube, and Facebook by detecting links.",
    longDescription: "Automatically detects media links in messages (TikTok, Instagram, YouTube, Facebook) and downloads all available media items using @mrnima/tiktok-downloader, @mrnima/instagram-downloader, @mrnima/facebook-downloader, and @distube/ytdl-core for YouTube. No fallback methods are used.",
    category: "media",
    usages: "Send a message containing a media URL",
    cooldown: 5,
  },

  onStart: async function ({ message, event }) {
    const messageContent = event.body;

    // Regular expression to find URLs in the message content
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const matches = messageContent.match(urlRegex);

    // If no URL is found, or the first found URL doesn't start with http, do nothing.
    if (!matches || matches.length === 0 || !matches[0].startsWith("http")) {
      return; // Do not reply, just ignore if no valid URL is detected
    }

    const url = matches[0]; // Take the first detected URL

    // Define the base file path for saving the downloaded media
    const baseFileName = `media_${Date.now()}`;

    try {
      message.reply("🔗 Link detected! Attempting to download all available media...");
      let mediaItemsToProcess = []; // Array to hold all media URLs and types to download

      // Determine the platform and call the appropriate function
      if (url.includes("tiktok.com")) {
        const info = await tiktok(url);
        console.log("@mrnima/tiktok-downloader Response:", info);
        // TikTok typically has one main video. Prioritize no-watermark then with-watermark.
        if (info?.success && info?.video) {
          if (info.video.no_watermark) {
            mediaItemsToProcess.push({ url: info.video.no_watermark, type: 'video' });
          } else if (info.video.with_watermark) {
            mediaItemsToProcess.push({ url: info.video.with_watermark, type: 'video' });
          }
        }
      } else if (url.includes("instagram.com")) {
        const info = await instagram(url); // Using @mrnima/instagram-downloader
        console.log("@mrnima/instagram-downloader Response:", info);
        // For Instagram, iterate through all media items (videos and images)
        if (info?.success && Array.isArray(info?.media)) {
          for (const mediaItem of info.media) {
            if (mediaItem.url) {
              // @mrnima/instagram-downloader includes 'type' (video or image)
              const mediaType = mediaItem.type === 'video' || mediaItem.url.includes('.mp4') ? 'video' : 'image';
              mediaItemsToProcess.push({ url: mediaItem.url, type: mediaType });
            }
          }
        }
      } else if (url.includes("facebook.com") || url.includes("fb.watch")) {
        const info = await facebook(url); // Using @mrnima/facebook-downloader
        console.log("@mrnima/facebook-downloader Response:", info);
        // Facebook can have videos. Check for a direct video URL in the result.
        if (info?.success && info?.url) {
          mediaItemsToProcess.push({ url: info.url, type: 'video' });
        } else if (info?.success && info?.video_url) { // Fallback for possible video_url field
          mediaItemsToProcess.push({ url: info.video_url, type: 'video' });
        }
      } else if (url.includes("youtube.com") || url.includes("youtu.be")) {
        const info = await ytdl.getInfo(url); // Using @distube/ytdl-core for YouTube
        console.log("@distube/ytdl-core YouTube Response:", info);
        // YouTube typically has one main video. Select the best format with audio.
        const format = ytdl.chooseFormat(info.formats, { quality: 'highest', filter: 'audioandvideo' });
        if (format?.url) {
          mediaItemsToProcess.push({ url: format.url, type: 'video' });
        }
      }

      // If any media URLs were successfully extracted
      if (mediaItemsToProcess.length > 0) {
        for (let i = 0; i < mediaItemsToProcess.length; i++) {
          const item = mediaItemsToProcess[i];
          // Determine file extension based on media type for correct saving
          const fileExtension = item.type === 'video' ? 'mp4' : (item.type === 'image' ? 'jpg' : 'bin'); // Default to .bin for unknown
          const itemFileName = `${baseFileName}_${i + 1}.${fileExtension}`; // Add part number to filename
          const itemFilePath = path.join(__dirname, "cache", itemFileName);

          await downloadMedia(item.url, itemFilePath); // Download the media item
          // Send each media item separately, indicating part number if multiple
          await sendMedia(message, itemFilePath, item.type, i + 1, mediaItemsToProcess.length);
        }
        return; // All media items processed and sent
      }

      // If no media URL was found for the detected platform
      throw new Error("No downloadable media found for the provided URL.");

    } catch (err) {
      console.error("Error with media download:", err.message); // Log error
      return message.reply(`❌ Failed to download media: ${err.message}. Please ensure the link is valid and supported.`);
    }
  }
};

/**
 * Downloads media (video or image) from a given URL to a specified file path.
 * @param {string} url - The URL of the media to download.
 * @param {string} filePath - The path where the media should be saved.
 * @returns {Promise<void>} A promise that resolves when the download is complete.
 */
function downloadMedia(url, filePath) {
  return new Promise((resolve, reject) => {
    axios({ url, method: "GET", responseType: "stream" })
      .then(res => {
        const writer = fs.createWriteStream(filePath);
        res.data.pipe(writer); // Pipe the media stream to the file
        writer.on("finish", resolve); // Resolve the promise on successful write
        writer.on("error", (err) => {
          console.error("Error writing media file:", err);
          reject(err); // Reject on write error
        });
      }).catch(err => {
        console.error("Error during media download stream:", err);
        reject(err); // Reject on network or stream error
      });
  });
}

/**
 * Sends the downloaded media as an attachment and then deletes the local file.
 * @param {object} message - The message object to reply to.
 * @param {string} filePath - The path of the downloaded media file.
 * @param {string} mediaType - 'video' or 'image' to determine attachment type.
 * @param {number} [currentPart] - Optional: current part number for multi-media posts.
 * @param {number} [totalParts] - Optional: total parts for multi-media posts.
 */
function sendMedia(message, filePath, mediaType, currentPart = 1, totalParts = 1) {
  const partInfo = totalParts > 1 ? ` (Part ${currentPart} of ${totalParts})` : '';
  const attachmentObject = {
    body: `✅ Here is your ${mediaType}${partInfo}!`,
    attachment: fs.createReadStream(filePath) // Attach the media file
  };

  message.reply(attachmentObject, (err) => {
    if (err) console.error("Error sending media message:", err);
    // Delete the temporary media file after sending
    fs.unlink(filePath, (unlinkErr) => {
      if (unlinkErr) console.error("Error deleting media file:", unlinkErr);
    });
  });
 }
