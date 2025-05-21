const cheerio = require('cheerio');
const tinyurl = require('tinyurl');
const { getFbVideoInfo } = require('fb-downloader-scrapper');
const { igdl } = require('btch-downloader');
 config = { 
  name: "download",
  version: "3.9-bun",
  author: "You", 
  countDown: 18,
  role: 0,
  description: "Downloads video from social media (Twitter/X, FB, Insta, TikTok, Pinterest, YouTube). Handles URLs with spaces. Polls YT up to 2 mins. Sends text/attachments separately.",
  category: "Utility",
  guide: "Send a Twitter/X, Facebook, Instagram, TikTok, Pinterest, or YouTube video URL (even with extra spaces like 'https:// facebook . com /...' or 'https://fb.watch /...'). Text info and video sent separately. Large videos sent as links. YT prioritizes 1080p -> 720p -> 480p -> 360p, polling up to 2 minutes per quality.",
  prefix: "false" 
};

const MAX_DESC_LENGTH = 1950;
const YT_POLL_INTERVAL_MS = 2000;
const YT_POLL_MAX_DURATION_MS = 120 * 1000;
const YT_PREFERRED_QUALITIES = ['1080', '720', '480', '360'];
const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function initiateYoutubeDownloadRequest(youtubeUrl, quality) {
    const encodedUrl = encodeURIComponent(youtubeUrl);
    const apiUrl = `https:
    console.log(`[download.js] YT Initiate Request: GET ${apiUrl}`);

    try {
        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                'Accept': '*/*',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36', 
                'Origin': 'https://en.loader.to',
                'Referer': 'https://en.loader.to/',
            },
            signal: AbortSignal.timeout(20000)
        });

        console.log(`[download.js] YT Initiate Response Status: ${response.status} for quality ${quality}`);
        if (!response.ok) {
            const errorText = await response.text().catch(() => "Could not read error response body");
            console.warn(`[download.js] YT Initiate failed with HTTP status ${response.status} for quality ${quality}. Body: ${errorText.substring(0, 200)}`);
            return null;
        }
        const responseData = await response.json();

        if (responseData && responseData.success === true && responseData.id && responseData.title) {
            console.log(`[download.js] YT download initiated for ${quality}p. Task ID: ${responseData.id}, Title: ${responseData.title}`);
            return { id: responseData.id, title: responseData.title };
        } else {
            console.warn(`[download.js] YT Initiate failed for quality ${quality}. Success: ${responseData?.success}, ID: ${responseData?.id}, Title: ${responseData?.title}. API Message: ${responseData?.text || responseData?.message}`);
            return null;
        }
    } catch (error) {
        console.error(`[download.js] ${error.name === 'TimeoutError' ? 'TIMEOUT' : 'ERROR'} initiating YT download for quality ${quality}: ${error.message}`);
        return null;
    }
}

async function pollYoutubeProgress(taskId, title, quality) {
    const progressUrl = `https:
    console.log(`[download.js] YT Polling started for Task ID: ${taskId} (${quality}). Max duration: ~${YT_POLL_MAX_DURATION_MS / 1000}s.`);
    const startTime = Date.now();
    let attempt = 0;

    while (Date.now() - startTime < YT_POLL_MAX_DURATION_MS) {
        attempt++;
        const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);
        console.log(`[download.js] YT Poll Attempt ${attempt} for Task ID: ${taskId}. Elapsed: ${elapsedSeconds}s / ${YT_POLL_MAX_DURATION_MS / 1000}s`);

        try {
            await new Promise(resolve => setTimeout(resolve, YT_POLL_INTERVAL_MS));
            if (Date.now() - startTime >= YT_POLL_MAX_DURATION_MS) {
                console.log(`[download.js] YT Poll time limit reached before attempt ${attempt} for Task ID: ${taskId}`);
                break;
            }

            const response = await fetch(progressUrl, {
                method: 'GET',
                headers: {
                    'Accept': '*/*',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',  
                    'Origin': 'https://en.loader.to',
                    'Referer': 'https://en.loader.to/'
                },
                signal: AbortSignal.timeout(15000)
            });

            if (!response.ok) {
                if (response.status === 404) {
                    console.error(`[download.js] YT Poll received 404, Task ID ${taskId} likely invalid/expired.`);
                    return null;
                }
                console.warn(`[download.js] YT Poll server error ${response.status}, continuing... Body: ${(await response.text().catch(()=>"")).substring(0,200)}`);
                continue;
            }
            const responseData = await response.json();

            if (responseData?.success === 1 && responseData.progress === 1000 && responseData.download_url) {
                console.log(`[download.js] YT download ready for Task ID: ${taskId}. URL: ${responseData.download_url}`);
                return { downloadUrl: responseData.download_url, title: title, actualQuality: quality };
            } else if (responseData?.success !== 1 && responseData?.text) {
                console.error(`[download.js] YT Poll API failure for Task ID ${taskId}. Message: ${responseData.text}`);
                if (responseData.text.toLowerCase().includes("could not be processed") || responseData.text.toLowerCase().includes("no video found")) {
                    console.warn(`[download.js] YT Poll: format ${quality} might be unavailable for Task ID ${taskId}.`);
                }
                return null;
            } else {
                console.log(`[download.js] YT Progress for Task ID ${taskId}: ${responseData?.progress || 'N/A'}/1000 (Success: ${responseData?.success})`);
            }
        } catch (error) {
            console.error(`[download.js] ${error.name === 'TimeoutError' ? 'TIMEOUT' : 'ERROR'} polling YT for Task ID ${taskId} (Attempt ${attempt}): ${error.message}`);
            if (error.message.includes("Setup Error")) return null; 
        }
    }
    console.error(`[download.js] YT download polling timed out for Task ID: ${taskId}`);
    return null;
}

async function shortenUrl(url) {
  try {
    const shortUrl = await tinyurl.shorten(url);
    console.log(`[download.js] Shortened ${url} to ${shortUrl}`);
    return shortUrl;
  } catch (error) {
    console.error(`[download.js] ERROR shortening URL ${url}: ${error.message}. Using original.`);
    return url;
  }
}

async function sendVideoAttachment(messageContext, originalUrl, platformName, baseDescription) {
  let descriptionToSend = `${baseDescription}\n\n${originalUrl}\n\n\nPress the url to download the video. As it'll preserve quality and in some cases, bot will fail to send videos.`;
  let displayUrl = originalUrl;

  if (descriptionToSend.length > MAX_DESC_LENGTH) {
    displayUrl = await shortenUrl(originalUrl);
    descriptionToSend = `${baseDescription}\n\n${displayUrl}`;
    if (descriptionToSend.length > MAX_DESC_LENGTH) {
       const availableLength = MAX_DESC_LENGTH - displayUrl.length - 4; 
       baseDescription = baseDescription.substring(0, Math.max(0, availableLength)) + '...';
       descriptionToSend = `${baseDescription}\n\n${displayUrl}`;
    }
  }

  try {
    await messageContext.send(descriptionToSend);
    console.log(`[download.js] Sent text description for ${platformName} video.`);
    await new Promise(resolve => setTimeout(resolve, 300));
  } catch (textError) {
    console.error(`[download.js] ERROR sending text description for ${platformName}: ${textError.message}`);
    if (textError.fbtrace_id) console.error(`[download.js] Text Send FBTraceID: ${textError.fbtrace_id}`);
  }

  try {
    const response = await fetch(originalUrl, { signal: AbortSignal.timeout(60000) }); 
    if (!response.ok || !response.body) {
        throw new Error(`Failed to fetch video for attachment: ${response.status} ${response.statusText}`);
    }
    await messageContext.send({ attachment: { url: displayUrl, type: "video" } });
    console.log(`[download.js] Successfully sent ${platformName} video attachment as stream.`);
  } catch (attachmentError) {
    console.error(`[download.js] ERROR sending ${platformName} video as attachment stream: ${attachmentError.message}`);
    if (attachmentError.fbtrace_id) console.error(`[download.js] Attachment Send FBTraceID: ${attachmentError.fbtrace_id}`);
    const fallbackMessage = `Couldn't send the ${platformName} video file directly.\nDownload link (may expire):\n${originalUrl}`;
    try {
      await messageContext.reply(fallbackMessage);
      console.log(`[download.js] Sent fallback link for ${platformName} video.`);
    } catch (replyError) {
      console.error(`[download.js] ERROR sending fallback message: ${replyError.message}`);
    }
  }
}

async function fetchJsonApi(url, options, platformNameForLogging) {
    try {
        const response = await fetch(url, options);
        if (!response.ok) {
            const errorBody = await response.text().catch(() => `Status: ${response.status}`);
            console.error(`[download.js] ${platformNameForLogging} API Error HTTP ${response.status}: ${errorBody.substring(0, 300)}`);
            throw new Error(`${platformNameForLogging} API request failed with status ${response.status}`);
        }
        const data = await response.json();
        if (!data) {
            console.warn(`[download.js] ${platformNameForLogging} API returned empty/unexpected data from ${url}`);
            throw new Error(`${platformNameForLogging} API returned no usable data.`);
        }
        return data;
    } catch (error) {
        if (error.name === 'TimeoutError') {
            console.error(`[download.js] ${platformNameForLogging} API request to ${url} timed out.`);
            throw new Error(`${platformNameForLogging} API request timed out.`);
        }
        if (!error.message.startsWith(platformNameForLogging)) {
            console.error(`[download.js] ${platformNameForLogging} API Fetch Error for ${url}: ${error.message}`);
        }
        throw error;
    }
}

async function handleTwitter(url) {
    const apiEndpoint = 'https://tw1d.net/mates/en/analyze/ajax?platform=twitter';
    const params = new URLSearchParams({ url, platform: 'twitter', ajax: '1', lang: 'en' });
    const response = await fetch(apiEndpoint, {
        method: 'POST',
        body: params,
        headers: {
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'Origin': 'https://tw1d.net',
            'Referer': 'https://tw1d.net/mates/en/twitter',
            'User-Agent': DEFAULT_USER_AGENT,
            'X-Requested-With': 'XMLHttpRequest'
        },
        signal: AbortSignal.timeout(30000)
    });

    if (!response.ok) throw new Error(`Twitter API request failed: ${response.status}. Body: ${(await response.text().catch(()=>"")).substring(0,200)}`);
    const responseData = await response.json();

    if (responseData?.status === 'success' && responseData.result) {
        const $ = cheerio.load(responseData.result);
        const videoLinks = [];
        const downloadSection = $('.row.yyy').first();
        const targetLinks = downloadSection.length ? downloadSection.find('.col-12.xxx .card-body a[href]') : $('a[href*=".mp4"]');

        targetLinks.each((_, el) => {
            const href = $(el).attr('href');
            if (href && (href.includes('y2tmates.com') || href.includes('.mp4') || downloadSection.length === 0 )) {
                let resolution = $(el).find('.format-resolution').text().trim() || $(el).text().match(/(\d+x\d+)/)?.[1] || (href.includes('.mp4') ? 'mp4' : 'unknown');
                if (!videoLinks.some(link => link.href === href)) videoLinks.push({ href, resolution });
            }
        });
        if (downloadSection.length === 0 && videoLinks.length > 0) console.log('[download.js] Twitter: Used fallback link search.');

        let bestLink = null;
        let bestResolutionValue = 0;

        for (const link of videoLinks) {
            const [width, height] = link.resolution.split('x').map(Number);
            const resolutionValue = width * height;

            if (resolutionValue > bestResolutionValue) {
                bestResolutionValue = resolutionValue;
                bestLink = link;
            }
        }

        if (bestLink) {
            console.log(`[download.js] Prioritized Twitter link: ${bestLink.resolution} - ${bestLink.href}`);
            return { downloadUrl: bestLink.href, description: `Twitter Video (${bestLink.resolution})` };
        }
        throw new Error("Couldn't find any downloadable video links for this tweet.");
    }
    throw new Error(`Twitter API Error: Status ${responseData?.status}, Message: ${responseData?.result || responseData?.message || 'N/A'}`);
}

async function handleFacebook(url) {
    try {
      const fbInfo = await getFbVideoInfo(url);

      if (fbInfo?.hd) {
        console.log(`[download.js] Got FB video URL: ${fbInfo.hd.substring(0, 100)}...`);
        return {
          downloadUrl: fbInfo.hd,
          description: `Facebook Video (${fbInfo.title || 'Untitled'})`,
        };
      } else {
        throw new Error("No HD video URL found in response from Facebook.");
      }
    } catch (error) {
      console.error(`[download.js] Error fetching Facebook video: ${error.message}`);
      throw new Error("Couldn't fetch the Facebook video from available sources.");
    }
  }

async function handleInstagram(url) {
    try {
        const igData = await igdl(url);
        if (igData?.HD) {
            console.log(`[download.js] Got Instagram HD video URL: ${igData.HD.substring(0, 100)}...`);
            return { downloadUrl: igData.HD, description: `Instagram Video` };
        } else if (igData?.Normal_video) {
            console.log(`[download.js] Got Instagram Normal video URL: ${igData.Normal_video.substring(0, 100)}...`);
            return { downloadUrl: igData.Normal_video, description: `Instagram Video` };
        }
    } catch (primaryError) {
        console.error(`[download.js] Instagram igdl error: ${primaryError.message}`);
        const apiUrl = `https:
        try {
            const data = await fetchJsonApi(apiUrl, { headers: { 'User-Agent': DEFAULT_USER_AGENT }, signal: AbortSignal.timeout(30000) }, "Instagram (kaiz-apis fallback)");
            if (data?.result?.video_url) {
                const { video_url: mediaUrl } = data.result;
                console.log(`[download.js] Got Instagram media URL (kaiz-apis fallback): ${mediaUrl.substring(0, 100)}...`);
                return { downloadUrl: mediaUrl, description: `Instagram Video` };
            } else {
                throw new Error(`Kaiz-apis fallback failed. API Response: ${JSON.stringify(data).substring(0, 100)}`);
            }
        } catch (secondaryError) {
            console.error(`[download.js] Instagram kaiz-apis fallback error: ${secondaryError.message}`);
            throw new Error(`Failed to process Instagram link. Both igdl and kaiz-apis failed.`);
        }
    }
    throw new Error("Failed to process Instagram link.");
}

async function handleTikTok(url, messageContext) {
    const apiUrl = `https:
    const data = await fetchJsonApi(apiUrl, { headers: { 'User-Agent': DEFAULT_USER_AGENT }, signal: AbortSignal.timeout(35000) }, "TikTok");
    if (data?.url && data?.type === 'video') {
        const { url: videoUrl, title = "TikTok Video" } = data;
        console.log(`[download.js] Got TikTok video URL: ${videoUrl.substring(0,100)}...`);
        return { downloadUrl: videoUrl, description: title };
    } else if (data?.mp3 && data?.type !== 'video') {
        await messageContext.reply(`This TikTok link seems to be audio or a slideshow, not a standard video.\nAudio link: ${data.mp3 || 'N/A'}`);
        return null; 
    }
    throw new Error(`Failed to process TikTok link. API Response: ${JSON.stringify(data).substring(0,100)}`);
}

async function handlePinterest(url) {
    const apiUrl = 'https://sigmawire.net/pindown.php';
    const formData = new URLSearchParams();
    formData.append('url', url);

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: formData,
            signal: AbortSignal.timeout(60000)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (data?.direct_mp4) {
            const title = data.headline || "Pinterest Video";
            const downloadUrl = `https:
            console.log(`[download.js] Got Pinterest video URL: ${data.direct_mp4.substring(0, 100)}...`);
            return { downloadUrl: downloadUrl, description: title };
        } else {
            throw new Error(`Failed to process Pinterest link. API Response: ${JSON.stringify(data).substring(0, 100)}`);
        }

    } catch (error) {
        console.error(`[download.js] Pinterest API error: ${error.message}`);
        throw new Error(`Failed to process Pinterest link: ${error.message}`);
    }
}

async function handleYouTube(url, messageContext) {
    await messageContext.reply(`Processing YouTube link. Trying qualities: ${YT_PREFERRED_QUALITIES.join('p, ')}p... (up to 2 mins per quality) ⏳`);
    let finalResult = null, triedQualities = [], lastErrorMsg = '';

    for (const quality of YT_PREFERRED_QUALITIES) {
        const qualityStr = quality + 'p';
        triedQualities.push(qualityStr);
        let attemptMsg = null;
        try {
            attemptMsg = await messageContext.reply(`Attempting ${qualityStr}...`);
            console.log(`[download.js] Trying YouTube quality: ${qualityStr} for URL: ${url}`);
            const initData = await initiateYoutubeDownloadRequest(url, quality);

            if (initData?.id && initData.title) {
                const progressMessage = `Processing ${qualityStr} (Task ID: ${initData.id.substring(0, 6)}...). Polling for up to 2 mins... ⏳`;
                if (attemptMsg?.messageID && messageContext.reply) { 
                     await messageContext.reply(progressMessage, attemptMsg.messageID);
                } else { await messageContext.reply(progressMessage); }

                const pollResult = await pollYoutubeProgress(initData.id, initData.title, qualityStr);
                if (pollResult?.downloadUrl) {
                    finalResult = pollResult;
                    await messageContext.reply(`✅ Success processing ${qualityStr}! Preparing to send...`);
                    break;
                }
                lastErrorMsg = `Failed to get download URL for ${qualityStr} after polling.`;
            } else {
                lastErrorMsg = `Could not start download process for ${qualityStr}. Quality might be unavailable or initial                 request failed.`;
            }
        } catch (error) {
            lastErrorMsg = `Error processing ${qualityStr}: ${error.message}`;
            console.error(`[download.js] YouTube error for ${qualityStr}: ${error.message}`);
        } finally {
            if (attemptMsg?.messageID && messageContext.reply) {
                await messageContext.reply(`Moving to next quality or finalizing...`, attemptMsg.messageID).catch(err => 
                    console.error(`[download.js] Error updating attempt message: ${err.message}`));
            }
        }
    }

    if (finalResult) {
        console.log(`[download.js] YouTube download successful: ${finalResult.downloadUrl} (${finalResult.actualQuality})`);
        return { 
            downloadUrl: finalResult.downloadUrl, 
            description: `YouTube Video: ${finalResult.title} (${finalResult.actualQuality})` 
        };
    } else {
        const errorMessage = `Failed to process YouTube video after trying qualities: ${triedQualities.join(', ')}. Last error: ${lastErrorMsg}`;
        console.error(`[download.js] ${errorMessage}`);
        throw new Error(errorMessage);
    }
}

export async function onStart({ message, args, getLang }) {
    const inputUrl = args.join(' ').trim().replace(/\s+/g, '');
    if (!inputUrl) {
        return message.reply('Please provide a valid video URL from Twitter/X, Facebook, Instagram, TikTok, Pinterest, or YouTube.');
    }

    let platform = 'unknown';
    let handler = null;

    try {
        // Determine platform based on URL patterns
        if (inputUrl.includes('twitter.com') || inputUrl.includes('x.com')) {
            platform = 'Twitter/X';
            handler = handleTwitter;
        } else if (inputUrl.includes('facebook.com') || inputUrl.includes('fb.watch')) {
            platform = 'Facebook';
            handler = handleFacebook;
        } else if (inputUrl.includes('instagram.com')) {
            platform = 'Instagram';
            handler = handleInstagram;
        } else if (inputUrl.includes('tiktok.com')) {
            platform = 'TikTok';
            handler = handleTikTok;
        } else if (inputUrl.includes('pinterest.com')) {
            platform = 'Pinterest';
            handler = handlePinterest;
        } else if (inputUrl.includes('youtube.com') || inputUrl.includes('youtu.be')) {
            platform = 'YouTube';
            handler = handleYouTube;
        } else {
            return message.reply('Unsupported URL. Please provide a valid link from Twitter/X, Facebook, Instagram, TikTok, Pinterest, or YouTube.');
        }

        console.log(`[download.js] Processing ${platform} URL: ${inputUrl}`);

        // Execute the appropriate handler
        const result = await handler(inputUrl, message);
        if (!result) {
            // For TikTok, non-video content is already handled in handleTikTok
            if (platform !== 'TikTok') {
                throw new Error(`No downloadable content found for ${platform} URL.`);
            }
            return; // TikTok non-video case already replied
        }

        const { downloadUrl, description } = result;
        console.log(`[download.js] ${platform} handler returned download URL: ${downloadUrl.substring(0, 100)}...`);

        // Send video attachment or fallback link
        await sendVideoAttachment(message, downloadUrl, platform, description);

    } catch (error) {
        console.error(`[download.js] Error processing ${platform} URL ${inputUrl}: ${error.message}`);
        const errorMessage = `Failed to download ${platform} video: ${error.message}`;
        try {
            await message.reply(errorMessage);
        } catch (replyError) {
            console.error(`[download.js] Error sending error reply: ${replyError.message}`);
              }
            }
      }
 
