import { SpikyCache } from "@spikerko/web-modules/SpikyCache";
import Defaults from "../../components/Global/Defaults";
import Platform from "../../components/Global/Platform";
import Session from "../../components/Global/Session";
import { CheckForUpdates } from "../version/CheckForUpdates";

export let SpicyFetchCache = new SpikyCache({
    name: "SpicyFetch__Cache"
});

export default async function SpicyFetch(path: string, IsExternal: boolean = false, cache: boolean = false, cosmos: boolean = false): Promise<Response | any> {
    return new Promise(async (resolve, reject) => {
        const lyricsApi = Defaults.lyrics.api.url;

        const CurrentVersion = Session.SpicyLyrics.GetCurrentVersion();

        const url = IsExternal ? path :
            `${lyricsApi}/${path}${path.includes('?') ? '&' : '?'}origin_version=${CurrentVersion?.Text || 'unknown'}`;

        const CachedContent = await GetCachedContent(url);
        if (CachedContent) {
            // Here for backwards compatibility
            if (Array.isArray(CachedContent)) {
                resolve(CachedContent);
                return;
            }
            resolve([CachedContent, 200]);
            return;
        }

        const SpotifyAccessToken = await Platform.GetSpotifyAccessToken();

        if (cosmos) {
            Spicetify.CosmosAsync.get(url)
                .then(async res => {
                    const data = typeof res === "object" ? JSON.stringify(res) : res;
                    const sentData = [data, res.status];
                    resolve(sentData)
                    if (cache) {
                        await CacheContent(url, sentData, 604800000);
                    }
                }).catch(err => {
                    console.log("CosmosAsync Error:", err)
                    reject(err)
                });
        } else {
            const SpicyLyricsAPI_Headers = IsExternal ? null : {};

            const SpotifyAPI_Headers = IsExternal ? {
                "Spotify-App-Version": Spicetify.Platform.version,
                "App-Platform": Spicetify.Platform.PlatformData.app_platform,
                "Accept": "application/json",
                "Content-Type": "application/json"
            } : null;

            const headers = {
                Authorization: `Bearer ${SpotifyAccessToken}`,
                ...SpotifyAPI_Headers,
                ...SpicyLyricsAPI_Headers
            };

            fetch(url, {
                method: "GET",
                headers: headers
            })
            .then(CheckForErrors)
            .then(async res => {
                if (res === null) {
                    resolve([null, 500]);
                    return;
                };

                const data = await res.text();
/*                 const isJson = ((data.startsWith(`{"`) || data.startsWith("{")) || (data.startsWith(`[`) || data.startsWith(`["`)));
                if (isJson) {
                    data = JSON.parse(data);
                } */
                const sentData = [data, res.status];
                resolve(sentData)
                if (cache) {
                    await CacheContent(url, sentData, 604800000);
                }
            }).catch(err => {
                console.log("Fetch Error:", err)
                reject(err)
            });
        }
    });
}

/**
 * Cache content with a specified expiration time
 * @param key - Cache key
 * @param data - Data to cache (object or string)
 * @param expirationTtl - Time to live in milliseconds (default: 7 days)
 */
async function CacheContent(key: string, data: any, expirationTtl: number = 604800000): Promise<void> {
    try {
        const expiresIn = Date.now() + expirationTtl;
        const processedKey = SpicyHasher.md5(key);

        const processedData = typeof data === "object" ? JSON.stringify(data) : data;

        // Use the correct options for pako.deflate
        const compressedData = pako.deflate(processedData, {
            level: 1 as 1  // Explicitly type as literal 1
        });
        const compressedString = String.fromCharCode(...new Uint8Array(compressedData)); // Encode to base64

        await SpicyFetchCache.set(processedKey, {
            Content: compressedString,
            expiresIn
        });
    } catch (error) {
        console.error("ERR CC", error);
        await SpicyFetchCache.destroy();
    }
}

/**
 * Retrieve cached content by key
 * @param key - Cache key
 * @returns Cached content or null if not found/expired
 */
async function GetCachedContent(key: string): Promise<object | string | null> {
    try {
        const processedKey = SpicyHasher.md5(key);
        const content = await SpicyFetchCache.get(processedKey);

        if (content) {
            if (content.expiresIn > Date.now()) {
                // Here for backwards compatibility
                if (typeof content.Content !== "string") {
                    await SpicyFetchCache.remove(processedKey);
                    return content.Content;
                }

                // Convert string to Uint8Array of character codes
                const compressedData = Uint8Array.from([...content.Content].map(c => c.charCodeAt(0)));

                // Use the correct options for pako.inflate
                const decompressedData = pako.inflate(compressedData, {
                    to: 'string' as 'string'  // Explicitly type as literal 'string'
                });

                // Try to parse as JSON if it looks like JSON
                if (typeof decompressedData === "string" &&
                    (decompressedData.startsWith("{") ||
                     decompressedData.startsWith(`{"`) ||
                     decompressedData.startsWith("[") ||
                     decompressedData.startsWith(`["`))) {
                    try {
                        return JSON.parse(decompressedData);
                    } catch (e) {
                        // If parsing fails, return as string
                        return decompressedData;
                    }
                }

                return decompressedData;
            } else {
                await SpicyFetchCache.remove(processedKey);
                return null;
            }
        }
        return null;
    } catch (error) {
        console.error("ERR CC", error);
        return null; // Ensure we always return a value
    }
}

export const _FETCH_CACHE = {
    GetCachedContent,
    CacheContent,
}

let ENDPOINT_DISABLEMENT_Shown = false;

/**
 * Check for API errors in the response
 * @param res - Fetch response object
 * @returns The response or null if handled
 */
async function CheckForErrors(res: Response): Promise<Response | null> {
    if (res.status === 500) {
        const TEXT = await res.text();
        if (TEXT.includes(`{"`)) {
            try {
                const data = JSON.parse(TEXT);
                if (data.type === "ENDPOINT_DISABLEMENT") {
                    if (ENDPOINT_DISABLEMENT_Shown) return res;
                    Spicetify.PopupModal.display({
                        title: "Endpoint Disabled",
                        content: `
                            <div>
                                <p>The endpoint you're trying to access is disabled.</p><br>
                                <p>This could mean a few things:</p><br>
                                <ul>
                                    <li>Maintenance on the API</li>
                                    <li>A Critical Issue</li>
                                    <li>A quick Disablement of the Endpoint</li>
                                </ul><br><br>
                                <p>If this problem persists, contact us on Github: <a href="https://github.com/spikenew7774/spicy-lyrics/" target="_blank" style="text-decoration:underline;">https://github.com/spikenew7774/spicy-lyrics</a>
                                ,<br> Or at <b>spikerko@spikerko.org</b></p>
                                <h3>Thanks!</h3>
                            </div>
                        `
                    });
                    ENDPOINT_DISABLEMENT_Shown = true;
                    return res;
                }
            } catch (e) {
                console.error("Error parsing error response:", e);
            }
            return res;
        }
        return res;
    } else if (res.status === 403) {
        const TEXT = await res.text();
        if (TEXT.includes(`{"`)) {
            try {
                const data = JSON.parse(TEXT);
                if (data?.message === "Update Spicy Lyrics") {
                    await CheckForUpdates(true);
                    return null;
                }
            } catch (e) {
                console.error("Error parsing 403 response:", e);
            }
        }
    }
    return res;
}