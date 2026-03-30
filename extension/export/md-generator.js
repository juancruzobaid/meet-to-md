// @ts-check
/// <reference path="../../types/index.js" />

/**
 * Regex to sanitise filenames — matches invalid characters for cross-platform safety.
 * Same regex used in background.js.
 * @see https://stackoverflow.com/a/78675894
 */
const invalidFilenameRegex = /[:?"*<>|~/\\\u{1}-\u{1f}\u{7f}\u{80}-\u{9f}\p{Cf}\p{Cn}]|^[.\u{0}\p{Zl}\p{Zp}\p{Zs}]|[.\u{0}\p{Zl}\p{Zp}\p{Zs}]$|^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?=\.|$)/gui

/**
 * Generates a sanitised filename for the meeting MD file.
 * Format: meet-to-md/YYYY-MM-DD [Meeting Title].md
 * @param {Meeting} meeting
 * @returns {string}
 */
function generateMdFilename(meeting) {
    try {
        const date = new Date(meeting.meetingStartTimestamp)
        const dateStr = formatDateISO(date)

        let title = "Meeting"
        if (meeting.meetingTitle) {
            title = meeting.meetingTitle.replaceAll(invalidFilenameRegex, "_")
        } else if (meeting.title) {
            title = meeting.title.replaceAll(invalidFilenameRegex, "_")
        }

        return `meet-to-md/${dateStr} ${title}.md`
    } catch (e) {
        return "meet-to-md/Meeting.md"
    }
}

/**
 * Generates the full Markdown content for the meeting.
 * @param {Meeting} meeting
 * @param {string} language - caption language code, e.g. "en" or "es"
 * @returns {string}
 */
function generateMdContent(meeting, language) {
    const startDate = new Date(meeting.meetingStartTimestamp)
    const dateISO = formatDateISO(startDate)
    const dateLong = formatDateLong(startDate)

    // Build participants list — deduplicated and sorted
    const participants = getUniqueParticipants(meeting.transcript)

    // Calculate duration in whole minutes
    const durationMinutes = calculateDurationMinutes(
        meeting.meetingStartTimestamp,
        meeting.meetingEndTimestamp
    )

    // Get meeting title
    const title = meeting.meetingTitle || meeting.title || ""

    // Build YAML frontmatter
    let md = "---\n"
    md += `date: ${dateISO}\n`
    md += `meeting_id: ""\n`
    md += `language: ${language}\n`
    md += "participants:\n"
    if (participants.length > 0) {
        participants.forEach(name => {
            md += `  - ${name}\n`
        })
    } else {
        md += "  []\n"
    }
    md += `duration_minutes: ${durationMinutes}\n`
    md += `source: Google Meet captions\n`
    md += "---\n\n"

    // H1 heading
    if (title) {
        md += `# ${title} — ${dateLong}\n`
    } else {
        md += `# Meeting — ${dateLong}\n`
    }

    // Transcript section
    md += "\n## Transcript\n\n"
    if (meeting.transcript.length > 0) {
        meeting.transcript.forEach(block => {
            const time = formatTime24(new Date(block.timestamp))
            md += `**${block.personName}** (${time}): ${block.transcriptText}\n\n`
        })
    }

    // Chat Messages section — only if there are messages
    if (meeting.chatMessages.length > 0) {
        md += "## Chat Messages\n\n"
        meeting.chatMessages.forEach(msg => {
            const time = formatTime24(new Date(msg.timestamp))
            md += `**${msg.personName}** (${time}): ${msg.chatMessageText}\n\n`
        })
    }

    return md
}

// --- Helper functions ---

/**
 * Formats a Date as YYYY-MM-DD in local timezone.
 * @param {Date} date
 * @returns {string}
 */
function formatDateISO(date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
}

/**
 * Formats a Date as "Month DD, YYYY" in local timezone.
 * @param {Date} date
 * @returns {string}
 */
function formatDateLong(date) {
    return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric"
    })
}

/**
 * Formats a Date as HH:MM in 24h format, local timezone.
 * @param {Date} date
 * @returns {string}
 */
function formatTime24(date) {
    const hours = String(date.getHours()).padStart(2, "0")
    const minutes = String(date.getMinutes()).padStart(2, "0")
    return `${hours}:${minutes}`
}

/**
 * Extracts unique participant names from transcript, sorted alphabetically.
 * @param {TranscriptBlock[] | []} transcript
 * @returns {string[]}
 */
function getUniqueParticipants(transcript) {
    if (!transcript || transcript.length === 0) return []
    const names = new Set(transcript.map(block => block.personName))
    return Array.from(names).sort((a, b) => a.localeCompare(b))
}

/**
 * Calculates duration in whole minutes between two ISO timestamps.
 * @param {string} startISO
 * @param {string} endISO
 * @returns {number}
 */
function calculateDurationMinutes(startISO, endISO) {
    if (!startISO || !endISO) return 0
    const start = new Date(startISO)
    const end = new Date(endISO)
    const diffMs = end.getTime() - start.getTime()
    if (diffMs <= 0) return 0
    return Math.floor(diffMs / 60000)
}
