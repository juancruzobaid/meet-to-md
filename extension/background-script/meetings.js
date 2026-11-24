import { downloadTranscript, postTranscriptToWebhook } from './exporters.js'

/**
 * In-memory lock: the processing run in progress, if any. Several independent triggers (meeting_ended, tab closed, recovery) can fire for the same meeting.
 * @type {Promise<string> | null}
 */
let ongoingProcessing = null

// Download transcripts, post webhook if URL is enabled and available. Idempotent per meetingStartTimestamp: a meeting is downloaded and posted automatically only once.
// A trigger arriving during a run shares that run's result, unless storage holds data that run did not save (e.g. another meeting ended meanwhile), which is then processed right after it.
// Fails if transcript is empty or webhook request fails or if no meetings in storage
/**
 * @returns {Promise<string>}
 * @throws error codes: 009, 010, 011, 012, 013, 014
 */
export function processLastMeeting() {
    if (ongoingProcessing) {
        const currentRun = ongoingProcessing
        const processPendingData = () => hasPendingMeetingData().then((isPending) => isPending ? processLastMeeting() : currentRun)
        return currentRun.then(processPendingData, processPendingData)
    }

    ongoingProcessing = runLastMeetingProcessing().finally(() => {
        ongoingProcessing = null
    })
    return ongoingProcessing
}

/**
 * @returns {Promise<string>}
 * @throws error codes: 009, 010, 011, 012, 013, 014
 */
function runLastMeetingProcessing() {
    return new Promise((resolve, reject) => {
        pickupLastMeetingFromStorage()
            .then((pickupResult) => {
                // Already downloaded and posted by the run which saved it
                if (pickupResult.alreadyProcessed) {
                    console.log("Last meeting already processed, skipping download and webhook")
                    resolve("Last meeting already processed")
                    return
                }

                chrome.storage.local.get(["meetings"], function (resultLocalUntyped) {
                    const resultLocal = /** @type {ResultLocal} */ (resultLocalUntyped)
                    chrome.storage.sync.get(["webhookUrl", "autoPostWebhookAfterMeeting", "autoDownloadFileAfterMeeting"], function (resultSyncUntyped) {
                        const resultSync = /** @type {ResultSync} */ (resultSyncUntyped)

                        // Create an array of promises to execute in parallel
                        /** @type {Promise<any>[]} */
                        const promises = []

                        // Meeting index to download and post webhook
                        // @ts-ignore - Because this line exists in the resolved promise from pickupLastMeetingFromStorage, which clearly means that at least one meeting exists and resultLocal.meetings cannot be undefined.
                        const lastIndex = resultLocal.meetings.length - 1

                        // Promise to download transcript
                        if (resultSync.autoDownloadFileAfterMeeting) {
                            promises.push(
                                downloadTranscript(lastIndex)
                            )
                        }

                        // Promise to post webhook if enabled
                        if (resultSync.autoPostWebhookAfterMeeting && resultSync.webhookUrl) {
                            promises.push(postTranscriptToWebhook(lastIndex))
                        }

                        // Execute all promises in parallel
                        Promise.all(promises)
                            .then(() => {
                                resolve("Meeting processing and download/webhook posting complete")
                            })
                            .catch(error => {
                                // Fails with error codes: 009, 010, 011, 012
                                const parsedError = /** @type {ErrorObject} */ (error)
                                console.error("Operation failed:", parsedError.errorMessage)
                                reject({ errorCode: parsedError.errorCode, errorMessage: parsedError.errorMessage })
                            })
                    })
                })
            })
            .catch((error) => {
                // Fails with error codes: 013, 014
                const parsedError = /** @type {ErrorObject} */ (error)
                reject({ errorCode: parsedError.errorCode, errorMessage: parsedError.errorMessage })
            })
    })
}

/**
 * @param {Meeting[]} meetings
 * @param {string} meetingStartTimestamp
 */
function findMeetingIndex(meetings, meetingStartTimestamp) {
    return meetings.findIndex((meeting) => meeting.meetingStartTimestamp === meetingStartTimestamp)
}

/**
 * Whether the picked up meeting data has more transcript blocks or chat messages than the saved entry of the same meeting
 * @param {{ transcript: TranscriptBlock[] | [], chatMessages: ChatMessage[] | [] }} newData
 * @param {Meeting} savedMeeting
 */
function hasMoreContent(newData, savedMeeting) {
    return (newData.transcript.length > savedMeeting.transcript.length) || (newData.chatMessages.length > savedMeeting.chatMessages.length)
}

/**
 * Whether storage holds meeting data that is not (completely) saved in meetings
 * @returns {Promise<boolean>}
 */
function hasPendingMeetingData() {
    return new Promise((resolve) => {
        chrome.storage.local.get(["meetings", "meetingStartTimestamp", "transcript", "chatMessages"], function (resultLocalUntyped) {
            const resultLocal = /** @type {ResultLocal} */ (resultLocalUntyped)

            const newData = { transcript: resultLocal.transcript || [], chatMessages: resultLocal.chatMessages || [] }

            if (!resultLocal.meetingStartTimestamp || ((newData.transcript.length === 0) && (newData.chatMessages.length === 0))) {
                resolve(false)
                return
            }
            const meetings = resultLocal.meetings || []
            const savedIndex = findMeetingIndex(meetings, resultLocal.meetingStartTimestamp)
            resolve((savedIndex === -1) || hasMoreContent(newData, meetings[savedIndex]))
        })
    })
}

/**
 * @returns {Promise<{ alreadyProcessed: boolean }>}
 * @throws error codes: 013, 014
 */
// Process transcript and chat messages of the meeting that just ended from storage, format them into strings, and save as a new entry in meetings (keeping last 10). If that meeting is already saved, no entry is added: the saved one is updated only if the new data is more complete.
export function pickupLastMeetingFromStorage() {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get([
            "meetingSoftware",
            "meetingTitle",
            "meetingStartTimestamp",
            "transcript",
            "chatMessages",
        ], function (resultUntyped) {
            const result = /** @type {ResultLocal} */ (resultUntyped)

            // An exception here would never settle the promise and leave the processing lock held
            const transcript = result.transcript || []
            const chatMessages = result.chatMessages || []

            if (result.meetingStartTimestamp) {
                if ((transcript.length > 0) || (chatMessages.length > 0)) {
                    // Create new transcript entry
                    /** @type {Meeting} */
                    const newMeetingEntry = {
                        meetingSoftware: result.meetingSoftware ? result.meetingSoftware : "",
                        meetingTitle: result.meetingTitle,
                        meetingStartTimestamp: result.meetingStartTimestamp,
                        meetingEndTimestamp: new Date().toISOString(),
                        transcript: transcript,
                        chatMessages: chatMessages,
                        webhookPostStatus: "new"
                    }

                    // meet-to-md: store caption language per meeting so later downloads keep the right value
                    chrome.storage.sync.get(["meetingLanguage", "defaultLanguage"], function (resultSyncUntyped) {
                        const resultSync = /** @type {ResultSync} */ (resultSyncUntyped)
                        newMeetingEntry.language = resultSync.meetingLanguage || resultSync.defaultLanguage || "en"

                        // Get existing recent meetings and add the new meeting
                        chrome.storage.local.get(["meetings"], function (resultLocalUntyped) {
                            const resultLocal = /** @type {ResultLocal} */ (resultLocalUntyped)
                            let meetings = resultLocal.meetings || []

                            const savedIndex = findMeetingIndex(meetings, newMeetingEntry.meetingStartTimestamp)
                            if (savedIndex !== -1) {
                                const savedMeeting = meetings[savedIndex]
                                const isLaterEnd = newMeetingEntry.meetingEndTimestamp > savedMeeting.meetingEndTimestamp

                                if (!hasMoreContent(newMeetingEntry, savedMeeting) && !isLaterEnd) {
                                    resolve({ alreadyProcessed: true })
                                    return
                                }

                                // Update only what is more complete. Everything else (title edited by the user, webhook status, language) is kept.
                                if (newMeetingEntry.transcript.length > savedMeeting.transcript.length) {
                                    savedMeeting.transcript = newMeetingEntry.transcript
                                }
                                if (newMeetingEntry.chatMessages.length > savedMeeting.chatMessages.length) {
                                    savedMeeting.chatMessages = newMeetingEntry.chatMessages
                                }
                                if (isLaterEnd) {
                                    savedMeeting.meetingEndTimestamp = newMeetingEntry.meetingEndTimestamp
                                }
                                chrome.storage.local.set({ meetings: meetings }, function () {
                                    console.log("Last meeting was already saved, entry updated")
                                    resolve({ alreadyProcessed: true })
                                })
                                return
                            }

                            meetings.push(newMeetingEntry)

                            // Keep only last 10 transcripts
                            if (meetings.length > 10) {
                                meetings = meetings.slice(-10)
                            }

                            // Save updated recent transcripts
                            chrome.storage.local.set({ meetings: meetings }, function () {
                                console.log("Last meeting picked up")
                                resolve({ alreadyProcessed: false })
                            })
                        })
                    })
                }
                else {
                    reject({ errorCode: "014", errorMessage: "Empty transcript and empty chatMessages" })
                }
            }
            else {
                reject({ errorCode: "013", errorMessage: "No meetings found. May be attend one?" })
            }
        })
    })
}


/** @throws error codes: 009, 010, 011, 012, 013, 014 */
export function recoverLastMeeting() {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(["meetings", "meetingStartTimestamp"], function (resultLocalUntyped) {
            const resultLocal = /** @type {ResultLocal} */ (resultLocalUntyped)
            // Check if user ever attended a meeting
            if (resultLocal.meetingStartTimestamp) {
                const isLastMeetingSaved = findMeetingIndex(resultLocal.meetings || [], resultLocal.meetingStartTimestamp) !== -1

                // Last meeting was not processed for some reason. Need to recover that data, process and download it.
                if (!isLastMeetingSaved) {
                    processLastMeeting().then(() => {
                        resolve("Recovered last meeting to the best possible extent")
                    }).catch((error) => {
                        // Fails with error codes: 009, 010, 011, 013, 014
                        const parsedError = /** @type {ErrorObject} */ (error)
                        reject({ errorCode: parsedError.errorCode, errorMessage: parsedError.errorMessage })
                    })
                }
                else {
                    resolve("No recovery needed")
                }
            }
            else {
                reject({ errorCode: "013", errorMessage: "No meetings found. May be attend one?" })
            }
        })
    })
}

