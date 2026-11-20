import { getTranscriptString, getChatMessagesString } from './utils.js'
import { TIMEFORMAT } from './config.js'
import { generateMdFilename, generateMdContent } from './md-generator.js'

// Webhook failure notifications are created with ids starting with this prefix, so a single onClicked listener (index.js) can route them
export const WEBHOOK_FAILED_NOTIFICATION_PREFIX = "webhook-failed-"

// Safety net for revoking blob: URLs if the download never reports completion
const BLOB_URL_REVOKE_TIMEOUT_MS = 5 * 60 * 1000

/**
 * @param {number} index
 * @param {boolean} [isWebhookEnabled]
 * @throws error codes: 009, 010
 */
export function downloadTranscript(index, isWebhookEnabled) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(["meetings"], function (resultLocalUntyped) {
            const resultLocal = /** @type {ResultLocal} */ (resultLocalUntyped)

            if (resultLocal.meetings && resultLocal.meetings[index]) {
                const meeting = resultLocal.meetings[index]

                // Markdown filename and content (meet-to-md)
                const fileName = generateMdFilename(meeting)
                const content = generateMdContent(meeting)

                const blob = new Blob([content], { type: "text/markdown" })

                // Firefox (background page): the downloads API rejects data: URLs, so use a blob: URL and revoke it once the download is done
                if (typeof URL.createObjectURL === "function") {
                    const blobUrl = URL.createObjectURL(blob)
                    downloadWithFallback(blobUrl, fileName)
                        .then((result) => {
                            revokeObjectUrlWhenDownloadEnds(blobUrl, result.downloadId)
                            resolve(result.message)
                        })
                        .catch((error) => {
                            URL.revokeObjectURL(blobUrl)
                            reject(error)
                        })
                    return
                }

                // Chromium (service worker): URL.createObjectURL is not available, so download a data: URL
                // Read the blob as a data URL
                const reader = new FileReader()

                // Read the blob
                reader.readAsDataURL(blob)

                // Download as text file, once blob is read
                reader.onload = function (event) {
                    if (event.target?.result) {
                        const dataUrl = /** @type {string} */ (event.target.result)

                        downloadWithFallback(dataUrl, fileName)
                            .then((result) => {
                                resolve(result.message)
                            })
                            .catch((error) => {
                                reject(error)
                            })
                    }
                    else {
                        reject({ errorCode: "009", errorMessage: "Failed to read blob" })
                    }
                }
            }
            else {
                reject({ errorCode: "010", errorMessage: "Meeting at specified index not found" })
            }
        })
    })
}

/**
 * Downloads the URL with the generated file name. If that fails (e.g. invalid file name), retries once with a safe file name. Resolves only once a download has started successfully.
 * @param {string} url data: or blob: URL of the Markdown file
 * @param {string} fileName
 * @returns {Promise<{ downloadId: number, message: string }>}
 * @throws error code: 009
 */
function downloadWithFallback(url, fileName) {
    // Create a download with Chrome Download API
    return chrome.downloads.download({
        url: url,
        filename: fileName,
        conflictAction: "uniquify"
    }).then((downloadId) => {
        console.log("Transcript downloaded")
        return { downloadId: downloadId, message: "Transcript downloaded successfully" }
    }).catch((err) => {
        console.error(err)
        console.log("Invalid file name. Retrying download to meet-to-md directory with simple file name.")
        // Fallback download with a safe file name. Resolve only once it succeeds.
        return chrome.downloads.download({
            url: url,
            filename: "meet-to-md/Meeting.md",
            conflictAction: "uniquify"
        }).then((downloadId) => {
            console.log("Transcript downloaded with default file name")
            return { downloadId: downloadId, message: "Transcript downloaded successfully with default file name" }
        }).catch((fallbackErr) => {
            console.error(fallbackErr)
            throw { errorCode: "009", errorMessage: String(fallbackErr) }
        })
    })
}

/**
 * Revokes a blob: URL once its download completes or is interrupted, with a timeout as a safety net.
 * @param {string} blobUrl
 * @param {number} downloadId
 */
function revokeObjectUrlWhenDownloadEnds(blobUrl, downloadId) {
    let isRevoked = false

    /** @param {chrome.downloads.DownloadDelta} downloadDelta */
    const onChanged = (downloadDelta) => {
        if ((downloadDelta.id === downloadId) && downloadDelta.state && (downloadDelta.state.current !== "in_progress")) {
            revoke()
        }
    }

    const timeoutId = setTimeout(revoke, BLOB_URL_REVOKE_TIMEOUT_MS)

    function revoke() {
        if (isRevoked) {
            return
        }
        isRevoked = true
        clearTimeout(timeoutId)
        chrome.downloads.onChanged.removeListener(onChanged)
        URL.revokeObjectURL(blobUrl)
        console.log("Download blob URL revoked")
    }

    chrome.downloads.onChanged.addListener(onChanged)

    // The download may already have ended before the listener was attached
    chrome.downloads.search({ id: downloadId })
        .then((downloadItems) => {
            if (downloadItems[0] && (downloadItems[0].state !== "in_progress")) {
                revoke()
            }
        })
        .catch((error) => {
            console.error(error)
        })
}

/**
 * @param {number} index
 * @throws error code: 010, 011, 012
 */
export function postTranscriptToWebhook(index) {
    return new Promise((resolve, reject) => {
        // Get webhook URL and meetings
        chrome.storage.local.get(["meetings"], function (resultLocalUntyped) {
            const resultLocal = /** @type {ResultLocal} */ (resultLocalUntyped)
            chrome.storage.sync.get(["webhookUrl", "webhookBodyType"], function (resultSyncUntyped) {
                const resultSync = /** @type {ResultSync} */ (resultSyncUntyped)

                if (resultSync.webhookUrl) {
                    if (resultLocal.meetings && resultLocal.meetings[index]) {
                        const meeting = resultLocal.meetings[index]

                        /** @type {WebhookBody} */
                        let webhookData
                        if (resultSync.webhookBodyType === "advanced") {
                            webhookData = {
                                webhookBodyType: "advanced",
                                meetingSoftware: meeting.meetingSoftware ? meeting.meetingSoftware : "",
                                meetingTitle: meeting.meetingTitle || meeting.title || "",
                                meetingStartTimestamp: new Date(meeting.meetingStartTimestamp).toISOString(),
                                meetingEndTimestamp: new Date(meeting.meetingEndTimestamp).toISOString(),
                                transcript: meeting.transcript,
                                chatMessages: meeting.chatMessages
                            }
                        }
                        else {
                            webhookData = {
                                webhookBodyType: "simple",
                                meetingSoftware: meeting.meetingSoftware ? meeting.meetingSoftware : "",
                                meetingTitle: meeting.meetingTitle || meeting.title || "",
                                meetingStartTimestamp: new Date(meeting.meetingStartTimestamp).toLocaleString("default", TIMEFORMAT).toUpperCase(),
                                meetingEndTimestamp: new Date(meeting.meetingEndTimestamp).toLocaleString("default", TIMEFORMAT).toUpperCase(),
                                transcript: getTranscriptString(meeting.transcript),
                                chatMessages: getChatMessagesString(meeting.chatMessages)
                            }
                        }

                        // Post to webhook
                        fetch(resultSync.webhookUrl, {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json"
                            },
                            body: JSON.stringify(webhookData)
                        }).then(response => {
                            if (!response.ok) {
                                throw new Error(`Webhook request failed with HTTP status code ${response.status} ${response.statusText}`)
                            }
                        }).then(() => {
                            // Update success status.
                            // @ts-ignore - Pointless type error about resultLocal.meetings being undefined, which is already checked above.
                            resultLocal.meetings[index].webhookPostStatus = "successful"
                            chrome.storage.local.set({ meetings: resultLocal.meetings }, function () {
                                resolve("Webhook posted successfully")
                            })
                        }).catch(error => {
                            console.error(error)
                            // Update failure status.
                            // @ts-ignore - Pointless type error about resultLocal.meetings being undefined, which is already checked above.
                            resultLocal.meetings[index].webhookPostStatus = "failed"
                            chrome.storage.local.set({ meetings: resultLocal.meetings }, function () {
                                // Create notification, only if the optional permission is granted. Click is handled by the listener in index.js, which opens the meetings page.
                                chrome.permissions.contains({ permissions: ["notifications"] }).then((hasNotifyPermission) => {
                                    if (hasNotifyPermission) {
                                        chrome.notifications.create(`${WEBHOOK_FAILED_NOTIFICATION_PREFIX}${Date.now()}`, {
                                            type: "basic",
                                            iconUrl: chrome.runtime.getURL("icon.png"),
                                            title: "Could not post webhook!",
                                            message: "Click to view status and retry. Check console for more details."
                                        })
                                    }
                                }).catch((permissionError) => {
                                    console.error(permissionError)
                                })
                                reject({ errorCode: "011", errorMessage: error })
                            })
                        })
                    }
                    else {
                        reject({ errorCode: "010", errorMessage: "Meeting at specified index not found" })
                    }
                }
                else {
                    reject({ errorCode: "012", errorMessage: "No webhook URL configured" })
                }
            })
        })
    })
}