// @ts-check
/// <reference path="../types/chrome.d.ts" />
/// <reference path="../types/index.js" />

let isMeetingsTableExpanded = false
// Cached copy of the saved webhook URL. Firefox only allows permissions.request() synchronously inside a click handler, so the retry button cannot wait for a storage read before requesting the webhook host permission.
let savedWebhookUrl = ""

document.addEventListener("DOMContentLoaded", function () {
    const webhookUrlForm = document.querySelector("#webhook-url-form")
    const webhookUrlInput = document.querySelector("#webhook-url")
    const saveButton = document.querySelector("#save-webhook")
    const autoPostCheckbox = document.querySelector("#auto-post-webhook")
    const autoDownloadCheckbox = document.querySelector("#auto-download-file")
    const simpleWebhookBodyRadio = document.querySelector("#simple-webhook-body")
    const advancedWebhookBodyRadio = document.querySelector("#advanced-webhook-body")
    const recoverLastMeetingButton = document.querySelector("#recover-last-meeting")
    const showAllButton = document.querySelector("#show-all")

    // Initial load of transcripts
    loadMeetings()

    // Reload transcripts when page becomes visible
    document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "visible") {
            loadMeetings()
        }
    })

    chrome.storage.onChanged.addListener((changes, areaName) => {
        if ((areaName === "sync") && changes.webhookUrl) {
            savedWebhookUrl = changes.webhookUrl.newValue || ""
        }
        loadMeetings()
    })

    chrome.storage.sync.get(["webhookUrl"], function (resultSyncUntyped) {
        const resultSync = /** @type {ResultSync} */ (resultSyncUntyped)
        savedWebhookUrl = resultSync.webhookUrl || ""
    })

    if (recoverLastMeetingButton instanceof HTMLButtonElement) {
        recoverLastMeetingButton.addEventListener("click", function () {
            /** @type {ExtensionMessage} */
            const message = {
                type: "recover_last_meeting",
            }
            chrome.runtime.sendMessage(message, function (responseUntyped) {
                const response = /** @type {ExtensionResponse} */ (responseUntyped)
                loadMeetings()
                scrollTo({ top: 0, behavior: "smooth" })
                if (response.success) {
                    if (response.message === "No recovery needed") {
                        alert("Nothing to recover—you're on top of the world!")
                    }
                    else {
                        alert("Last meeting recovered successfully!")
                    }
                }
                else {
                    const parsedError = /** @type {ErrorObject} */ (response.message)
                    if (parsedError.errorCode === "013") {
                        alert(parsedError.errorMessage)
                    }
                    else if (parsedError.errorCode === "014") {
                        alert("Nothing to recover—you're on top of the world!")
                    }
                    else {
                        alert("Could not recover last meeting!")
                        console.error(parsedError.errorMessage)
                    }
                }
            })
        })
    }

    if (saveButton instanceof HTMLButtonElement && webhookUrlForm instanceof HTMLFormElement && webhookUrlInput instanceof HTMLInputElement && autoPostCheckbox instanceof HTMLInputElement && simpleWebhookBodyRadio instanceof HTMLInputElement && advancedWebhookBodyRadio instanceof HTMLInputElement) {
        // Initially disable the save button
        saveButton.disabled = true

        // Load saved webhook URL, auto-post setting, and webhook body type
        chrome.storage.sync.get(["webhookUrl", "autoPostWebhookAfterMeeting", "autoDownloadFileAfterMeeting", "webhookBodyType"], function (resultSyncUntyped) {
            const resultSync = /** @type {ResultSync} */ (resultSyncUntyped)

            if (resultSync.webhookUrl) {
                webhookUrlInput.value = resultSync.webhookUrl
                saveButton.disabled = !webhookUrlInput.checkValidity()
            }

            // Set checkbox state
            autoPostCheckbox.checked = resultSync.autoPostWebhookAfterMeeting
            if (autoDownloadCheckbox instanceof HTMLInputElement) {
                autoDownloadCheckbox.checked = resultSync.autoDownloadFileAfterMeeting !== false
            }
            updateAutoDownloadCheckBox()

            // Set radio button state
            if (resultSync.webhookBodyType === "advanced") {
                advancedWebhookBodyRadio.checked = true
            } else {
                simpleWebhookBodyRadio.checked = true
            }
        })

        // Handle URL input changes
        webhookUrlInput.addEventListener("input", function () {
            saveButton.disabled = !webhookUrlInput.checkValidity()
        })

        // Save webhook URL, auto-post setting, and webhook body type
        webhookUrlForm.addEventListener("submit", function (e) {
            e.preventDefault()
            const webhookUrl = webhookUrlInput.value
            if (webhookUrl === "") {
                // Save webhook URL and settings
                chrome.storage.sync.set({
                    webhookUrl: webhookUrl
                }, function () {
                    alert("Webhook URL saved!")
                })
            }
            else if (webhookUrl && webhookUrlInput.checkValidity()) {
                // Request runtime permission for the webhook URL
                requestWebhookAndNotificationPermission(webhookUrl).then(() => {
                    // Save webhook URL and settings
                    chrome.storage.sync.set({
                        webhookUrl: webhookUrl
                    }, function () {
                        alert("Webhook URL saved!")
                    })
                }).catch((error) => {
                    alert("Fine! No webhooks for you!")
                    console.error("Webhook permission error:", error)
                })
            }
        })

        // Auto save auto-post setting
        autoPostCheckbox.addEventListener("change", function () {
            // Save webhook URL and settings
            chrome.storage.sync.set({
                autoPostWebhookAfterMeeting: autoPostCheckbox.checked,
            }, function () {
                updateAutoDownloadCheckBox()
            })
        })

        if (autoDownloadCheckbox instanceof HTMLInputElement) {
            autoDownloadCheckbox.addEventListener("change", function () {
                if (!autoDownloadCheckbox.checked) {
                    if (!confirm("Text file serves as a harmless backup, you sure you don't need it?")) {
                        autoDownloadCheckbox.checked = true
                        return
                    }
                }
                chrome.storage.sync.set({
                    autoDownloadFileAfterMeeting: autoDownloadCheckbox.checked,
                }, function () { })
            })
        }

        function updateAutoDownloadCheckBox() {
            if (autoDownloadCheckbox?.parentElement instanceof HTMLDivElement && autoPostCheckbox instanceof HTMLInputElement) {
                autoDownloadCheckbox.parentElement.style.display = autoPostCheckbox.checked ? "flex" : "none"
                if (!autoPostCheckbox.checked && autoDownloadCheckbox instanceof HTMLInputElement) {
                    autoDownloadCheckbox.checked = true
                    chrome.storage.sync.set({
                        autoDownloadFileAfterMeeting: true,
                    }, function () { })
                }
            }
        }

        // Auto save webhook body type
        simpleWebhookBodyRadio.addEventListener("change", function () {
            // Save webhook URL and settings
            chrome.storage.sync.set({ webhookBodyType: "simple" }, function () { })
        })

        // Auto save webhook body type
        advancedWebhookBodyRadio.addEventListener("change", function () {
            // Save webhook URL and settings
            chrome.storage.sync.set({ webhookBodyType: advancedWebhookBodyRadio.checked ? "advanced" : "simple" }, function () { })
        })
    }

    if (showAllButton instanceof HTMLButtonElement) {
        showAllButton.addEventListener("click", () => {
            const meetingsTableContainer = document.querySelector("#meetings-table-container")
            meetingsTableContainer?.classList.remove("fade-mask")
            showAllButton.setAttribute("style", "display:none;")
            isMeetingsTableExpanded = true
        })
    }

    // Google Meet access banner
    updateMeetAccessBanner()
    chrome.permissions.onAdded.addListener(updateMeetAccessBanner)
    chrome.permissions.onRemoved.addListener(updateMeetAccessBanner)

    const grantMeetAccessButton = document.querySelector("#grant-meet-access")
    if (grantMeetAccessButton instanceof HTMLButtonElement) {
        grantMeetAccessButton.addEventListener("click", function () {
            // Called synchronously from the click handler (Firefox user-gesture rule for permissions.request)
            requestGoogleMeetAccess()
                .catch((error) => {
                    console.error("Could not enable Google Meet:", error)
                })
                .finally(() => {
                    updateMeetAccessBanner()
                })
        })
    }
})


// Keep in sync with browser_specific_settings.gecko.data_collection_permissions.optional in manifest.json
const WEBHOOK_DATA_COLLECTION_TYPES = ["personalCommunications", "websiteContent"]

// Request runtime permission for webhook URL
/**
 * @param {string} url
 */
function requestWebhookAndNotificationPermission(url) {
    return new Promise((resolve, reject) => {
        try {
            const urlObj = new URL(url)
            const originPattern = `${urlObj.protocol}//${urlObj.hostname}/*`

            /** @type {chrome.permissions.Permissions & { data_collection?: string[] }} */
            const request = {
                origins: [originPattern],
                permissions: ["notifications"]
            }

            // Firefox (140+) built-in data consent: posting transcripts to a webhook sends meeting content off the device, so the optional data collection types declared in the manifest (browser_specific_settings.gecko.data_collection_permissions.optional) are requested in the same prompt. Chromium has no such concept and would reject the extra key, so it is only added in Firefox.
            // @ts-ignore - browser exists only in Firefox
            if ((typeof browser !== "undefined") && browser.runtime && (typeof browser.runtime.getBrowserInfo === "function")) {
                request.data_collection = WEBHOOK_DATA_COLLECTION_TYPES
            }

            // Request host, notifications (and, in Firefox, data collection) permissions. Must stay synchronous within the click/submit handler (Firefox user-gesture rule).
            chrome.permissions.request(request).then((granted) => {
                if (granted) {
                    resolve("Permission granted")
                } else {
                    reject(new Error("Permission denied"))
                }
            }).catch((error) => {
                reject(error)
            })
        } catch (error) {
            reject(error)
        }
    })
}

// Load and display recent transcripts
function loadMeetings() {
    const meetingsTable = document.querySelector("#meetings-table")

    chrome.storage.local.get(["meetings"], function (resultLocalUntyped) {
        const resultLocal = /** @type {ResultLocal} */ (resultLocalUntyped)
        // Clear existing content
        if (meetingsTable) {
            meetingsTable.innerHTML = ""


            if (resultLocal.meetings && resultLocal.meetings.length > 0) {
                const meetings = resultLocal.meetings
                // Loop through the array in reverse order to list latest meeting first
                for (let i = meetings.length - 1; i >= 0; i--) {
                    const meeting = meetings[i]
                    const timestamp = new Date(meeting.meetingStartTimestamp).toLocaleString()
                    const durationString = getDuration(meeting.meetingStartTimestamp, meeting.meetingEndTimestamp)

                    const row = document.createElement("tr")
                    row.innerHTML = `
                    <td>
                        <div contenteditable="true" class="meeting-title" data-index="${i}" title="Rename"></div>
                    </td>
                    <td>
                     ${meeting.meetingSoftware ? meeting.meetingSoftware : ""} 
                    </td>
                    <td>${timestamp} &nbsp; &#9679; &nbsp; ${durationString}</td>
                    <td>
                        ${(
                            () => {
                                switch (meeting.webhookPostStatus) {
                                    case "successful":
                                        return `<span class="status-success">Successful</span>`
                                    case "failed":
                                        return `<span class="status-failed">Failed</span>`
                                    case "new":
                                        return `<span class="status-new">New</span>`
                                    default:
                                        return `<span class="status-new">Unknown</span>`
                                }
                            }
                        )()}
                    </td>
                    <td>
                        <div style="display: flex; gap: 1rem; justify-content: end">
                            <button class="download-button" data-index="${i}" title="Download" aria-label="Download this meeting transcript">
                                <img src="./icons/download.svg" alt="">
                            </button>
                            <button class="post-button" data-index="${i}" title="${meeting.webhookPostStatus === "new" ? `Post webhook` : `Repost webhook`}" aria-label="${meeting.webhookPostStatus === "new" ? `` : ``}">
                                ${meeting.webhookPostStatus === "new" ? `` : ``}
                                <img src="./icons/webhook.svg" alt="">
                            </button>
                            &nbsp;
                             <button class="delete-button" data-index="${i}" title="Delete" aria-label="Delete this meeting">
                                <img src="./icons/delete.svg" alt="">
                            </button>
                        </div>
                    </td>
                `
                    meetingsTable.appendChild(row)

                    // Add event listener to meeting title input
                    const meetingTitleInput = row.querySelector(".meeting-title")
                    if (meetingTitleInput instanceof HTMLDivElement) {
                        // Set as text: the title comes from the Meet page and must not be parsed as HTML
                        meetingTitleInput.textContent = meeting.meetingTitle || meeting.title || "Google Meet call"
                        meetingTitleInput.addEventListener("blur", function () {
                            const updatedMeeting = /** @type {Meeting} */ {
                                ...meeting,
                                meetingTitle: meetingTitleInput.innerText
                            }
                            meetings[i] = updatedMeeting
                            chrome.storage.local.set({ meetings: meetings }, function () {
                                console.log("Meeting title updated")
                            })
                        })
                    }

                    // Add event listener to the webhook post button
                    const downloadButton = row.querySelector(".download-button")
                    if (downloadButton instanceof HTMLButtonElement) {
                        downloadButton.addEventListener("click", function () {
                            // Send message to background script to download text file
                            const index = parseInt(downloadButton.getAttribute("data-index") ?? "-1")
                            /** @type {ExtensionMessage} */
                            const message = {
                                type: "download_transcript_at_index",
                                index: index
                            }
                            chrome.runtime.sendMessage(message, (responseUntyped) => {
                                const response = /** @type {ExtensionResponse} */ (responseUntyped)
                                if (!response.success) {
                                    alert("Could not download transcript")
                                    const parsedError = /** @type {ErrorObject} */ (response.message)
                                    if (typeof parsedError === 'object') {
                                        console.error(parsedError.errorMessage)
                                    }
                                }
                            })
                        })
                    }

                    // Add event listener to the webhook post button
                    const webhookPostButton = row.querySelector(".post-button")
                    if (webhookPostButton instanceof HTMLButtonElement) {
                        webhookPostButton.addEventListener("click", function () {
                            if (savedWebhookUrl) {
                                // Request runtime permission for the webhook URL. Needed for cases when user signs on a new browser—webhook URL and other sync variables are available, but runtime permissions will be missing.
                                requestWebhookAndNotificationPermission(savedWebhookUrl).then(() => {
                                    // Disable button and update text
                                    webhookPostButton.disabled = true
                                    webhookPostButton.textContent = meeting.webhookPostStatus === "new" ? "Posting..." : "Reposting..."

                                    // Send message to background script to post webhook
                                    const index = parseInt(webhookPostButton.getAttribute("data-index") ?? "-1")
                                    /** @type {ExtensionMessage} */
                                    const message = {
                                        type: "post_webhook_at_index",
                                        index: index
                                    }
                                    chrome.runtime.sendMessage(message, (responseUntyped) => {
                                        const response = /** @type {ExtensionResponse} */ (responseUntyped)
                                        loadMeetings()
                                        if (response.success) {
                                            alert("Posted successfully!")
                                        }
                                        else {
                                            const parsedError = /** @type {ErrorObject} */ (response.message)
                                            if (typeof parsedError === 'object') {
                                                console.error(parsedError.errorMessage)
                                            }
                                        }
                                    })
                                }).catch((error) => {
                                    alert("Fine! No webhooks for you!")
                                    console.error("Webhook permission error:", error)
                                })
                            }
                            else {
                                alert("Please provide a webhook URL")
                            }
                        })
                    }

                    // Add event listener to the meeting delete button
                    const deleteButton = row.querySelector(".delete-button")
                    if (deleteButton instanceof HTMLButtonElement) {
                        deleteButton.addEventListener("click", function () {
                            if (confirm("Delete this meeting?")) {
                                meetings.splice(i, 1)
                                chrome.storage.local.set({ meetings: meetings }, function () {
                                    console.log("Meeting title updated")
                                })
                            }
                        })
                    }
                }
                const meetingsTableContainer = document.querySelector("#meetings-table-container")
                if (!isMeetingsTableExpanded && meetingsTableContainer && (meetingsTableContainer.clientHeight > 280)) {
                    meetingsTableContainer?.classList.add("fade-mask")
                    document.querySelector("#show-all")?.setAttribute("style", "display: block")
                }
            }
            else {
                meetingsTable.innerHTML = `<tr><td colspan="4">Your next meeting will show up here</td></tr>`
            }
        }
    })
}

/**
 * Shows a banner with a "Grant access" button when the user wants Google Meet capture but the browser does not grant
 * Meet access (Firefox treats host permissions as optional and the user can revoke them at any time).
 */
function updateMeetAccessBanner() {
    const banner = document.querySelector("#meet-access-banner")
    if (!banner) {
        return
    }

    chrome.storage.sync.get(["wantGoogleMeet"], function (resultSyncUntyped) {
        const resultSync = /** @type {ResultSync} */ (resultSyncUntyped)

        hasGoogleMeetAccess().then((hasAccess) => {
            // Do not nag users who explicitly turned Google Meet off in the popup
            banner.toggleAttribute("hidden", hasAccess || resultSync.wantGoogleMeet === false)
        }).catch((error) => {
            console.error(error)
        })
    })
}

// Format duration between two timestamps, specified in milliseconds elapsed since the epoch
/**
 * @param {string} meetingStartTimestamp - ISO timestamp
 * @param {string} meetingEndTimestamp - ISO timestamp
 */
function getDuration(meetingStartTimestamp, meetingEndTimestamp) {
    const duration = new Date(meetingEndTimestamp).getTime() - new Date(meetingStartTimestamp).getTime()
    const durationMinutes = Math.round(duration / (1000 * 60))
    const durationHours = Math.floor(durationMinutes / 60)
    const remainingMinutes = durationMinutes % 60
    return durationHours > 0
        ? `${durationHours}h ${remainingMinutes}m`
        : `${durationMinutes}m`
}