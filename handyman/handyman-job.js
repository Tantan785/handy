import { auth, db } from "../firebase-config.js";

import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

import {
    doc,
    getDoc,
    updateDoc,
    setDoc,
    serverTimestamp,
    onSnapshot,
    arrayUnion,
    increment,
    runTransaction
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";


/* =========================================================
   ELEMENTS
   ========================================================= */

const jobStatusText =
    document.getElementById("jobStatusText");

const jobStatusBadge =
    document.getElementById("jobStatusBadge");

const clientName =
    document.getElementById("clientName");

const clientEmail =
    document.getElementById("clientEmail");

const clientAvatar =
    document.getElementById("clientAvatar");

const jobService =
    document.getElementById("jobService");

const jobServiceDescription =
    document.getElementById("jobServiceDescription");

const jobDate =
    document.getElementById("jobDate");

const jobTime =
    document.getElementById("jobTime");

const bookingIdDisplay =
    document.getElementById("bookingIdDisplay");

const clientLocation =
    document.getElementById("clientLocation");

const jobDistance =
    document.getElementById("jobDistance");

const jobEta =
    document.getElementById("jobEta");

const messageClientButton =
    document.getElementById("messageClientButton");

const callClientButton =
    document.getElementById("callClientButton");

const navigationButton =
    document.getElementById("navigationButton");

const arrivedButton =
    document.getElementById("arrivedButton");

const startJobButton =
    document.getElementById("startJobButton");

const completeJobButton =
    document.getElementById("completeJobButton");

const cancelJobButton =
    document.getElementById("cancelJobButton");

const backToDashboard =
    document.getElementById("backToDashboard");

const dashboardLink =
    document.getElementById("dashboardLink");

const currentLocationButton =
    document.getElementById("currentLocationButton");

const zoomInButton =
    document.getElementById("zoomInButton");

const zoomOutButton =
    document.getElementById("zoomOutButton");

const jobMessage =
    document.getElementById("jobMessage");

const mapLocationPill =
    document.getElementById("mapLocationPill");


/* =========================================================
   STATE
   ========================================================= */

let currentUser = null;
let currentBooking = null;
let currentClient = null;
let currentHandyman = null;
let unsubscribeBooking = null;

let mapZoom = 1;


/* =========================================================
   HELPERS
   ========================================================= */

function showMessage(message, type = "error") {
    if (!jobMessage) return;

    jobMessage.textContent = message;
    jobMessage.classList.add("show");

    if (type === "success") {
        jobMessage.style.background = "#edf5ef";
        jobMessage.style.color = "#24543d";
    } else {
        jobMessage.style.background = "#fff7f7";
        jobMessage.style.color = "#8b3939";
    }

    setTimeout(() => {
        jobMessage.classList.remove("show");
    }, 4000);
}


function getBookingId() {
    const params = new URLSearchParams(window.location.search);

    return (
        params.get("bookingId") ||
        params.get("id") ||
        ""
    );
}


function getInitials(name = "Client") {
    const words = name
        .trim()
        .split(/\s+/)
        .filter(Boolean);

    if (!words.length) return "C";

    if (words.length === 1) {
        return words[0].substring(0, 2).toUpperCase();
    }

    return (
        words[0][0] +
        words[words.length - 1][0]
    ).toUpperCase();
}


function formatDate(value) {
    if (!value) return "--";

    try {
        if (value?.toDate) {
            return value.toDate().toLocaleDateString(
                "en-US",
                {
                    month: "long",
                    day: "numeric",
                    year: "numeric"
                }
            );
        }

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return String(value);
        }

        return date.toLocaleDateString(
            "en-US",
            {
                month: "long",
                day: "numeric",
                year: "numeric"
            }
        );
    } catch {
        return String(value);
    }
}


function formatTime(value) {
    if (!value) return "--";

    if (typeof value === "string") {
        return value;
    }

    try {
        if (value?.toDate) {
            return value.toDate().toLocaleTimeString(
                "en-US",
                {
                    hour: "numeric",
                    minute: "2-digit"
                }
            );
        }

        return String(value);
    } catch {
        return String(value);
    }
}


function getStatusInfo(status) {
    const normalized =
        String(status || "pending")
            .toLowerCase()
            .trim();

    const statuses = {
        pending: {
            text: "Booking request",
            badge: "Pending"
        },

        accepted: {
            text: "Booking accepted",
            badge: "Accepted"
        },

        confirmed: {
            text: "Booking confirmed",
            badge: "Confirmed"
        },

        scheduled: {
            text: "Scheduled service",
            badge: "Scheduled"
        },

        on_the_way: {
            text: "On the way to client",
            badge: "On the way"
        },

        arrived: {
            text: "Arrived at client",
            badge: "Arrived"
        },

        in_progress: {
            text: "Service in progress",
            badge: "In progress"
        },

        completed: {
            text: "Service completed",
            badge: "Completed"
        },

        cancelled: {
            text: "Job cancelled",
            badge: "Cancelled"
        },

        declined: {
            text: "Booking declined",
            badge: "Declined"
        }
    };

    return statuses[normalized] || {
        text: "Job status",
        badge: normalized
            .replaceAll("_", " ")
            .replace(/\b\w/g, letter => letter.toUpperCase())
    };
}


function isActiveStatus(status) {
    return [
        "accepted",
        "confirmed",
        "scheduled",
        "on_the_way",
        "arrived",
        "in_progress"
    ].includes(
        String(status || "").toLowerCase()
    );
}


/* =========================================================
   LOAD CLIENT
   ========================================================= */

async function loadClient(clientId) {
    if (!clientId) {
        currentClient = null;
        return;
    }

    try {
        const clientRef =
            doc(db, "users", clientId);

        const clientSnapshot =
            await getDoc(clientRef);

        if (!clientSnapshot.exists()) {
            currentClient = null;
            return;
        }

        currentClient = {
            id: clientSnapshot.id,
            ...clientSnapshot.data()
        };

        renderClient();

    } catch (error) {
        console.error(
            "HANDY JOB CLIENT LOAD ERROR:",
            error
        );

        showMessage(
            "Unable to load the client's information."
        );
    }
}


/* =========================================================
   LOAD HANDYMAN
   ========================================================= */

async function loadHandyman() {
    if (!currentUser) return;

    try {
        const handymanRef =
            doc(db, "users", currentUser.uid);

        const snapshot =
            await getDoc(handymanRef);

        if (!snapshot.exists()) {
            showMessage(
                "Your Handy profile could not be found."
            );
            return;
        }

        currentHandyman = {
            id: snapshot.id,
            ...snapshot.data()
        };

    } catch (error) {
        console.error(
            "HANDY JOB HANDYMAN LOAD ERROR:",
            error
        );
    }
}


/* =========================================================
   RENDER CLIENT
   ========================================================= */

function renderClient() {
    if (!currentClient) return;

    const name =
        currentClient.name ||
        currentClient.displayName ||
        "Client";

    clientName.textContent = name;

    clientEmail.textContent =
        currentClient.email ||
        currentClient.phone ||
        "Booking client";

    clientAvatar.textContent =
        getInitials(name);

    if (
        currentClient.phone &&
        String(currentClient.phone).trim()
    ) {
        callClientButton.disabled = false;
    } else {
        callClientButton.disabled = true;
    }
}


/* =========================================================
   RENDER BOOKING
   ========================================================= */

function renderBooking() {
    if (!currentBooking) return;

    const booking =
        currentBooking;

    const status =
        String(
            booking.status || "pending"
        ).toLowerCase();

    const statusInfo =
        getStatusInfo(status);

    jobStatusText.textContent =
        statusInfo.text;

    jobStatusBadge.textContent =
        statusInfo.badge;

    jobService.textContent =
        booking.serviceName ||
        booking.service ||
        booking.category ||
        "Handyman Service";

    jobServiceDescription.textContent =
        booking.serviceDescription ||
        "Scheduled handyman service";

    jobDate.textContent =
        formatDate(
            booking.date ||
            booking.scheduledDate ||
            booking.appointmentDate
        );

    jobTime.textContent =
        formatTime(
            booking.time ||
            booking.scheduledTime ||
            booking.appointmentTime
        );

    bookingIdDisplay.textContent =
        currentBooking.id;

    const location =
        booking.location ||
        booking.address ||
        booking.serviceAddress ||
        booking.clientLocation ||
        "";

    clientLocation.textContent =
        location || "Client location not provided";

    mapLocationPill.textContent =
        location
            ? "Client location"
            : "Location unavailable";

    if (booking.distance) {
        jobDistance.textContent =
            String(booking.distance);
    } else {
        jobDistance.textContent =
            "--";
    }

    if (booking.eta) {
        jobEta.textContent =
            String(booking.eta);
    } else {
        jobEta.textContent =
            "--";
    }

    updateActionButtons(status);
}


/* =========================================================
   ACTION BUTTONS
   ========================================================= */

function updateActionButtons(status) {
    const normalized =
        String(status || "")
            .toLowerCase();

    arrivedButton.disabled =
        ![
            "accepted",
            "confirmed",
            "scheduled",
            "on_the_way"
        ].includes(normalized);

    startJobButton.disabled =
        normalized !== "arrived";

    completeJobButton.disabled =
        normalized !== "in_progress";

    cancelJobButton.disabled =
        [
            "completed",
            "cancelled",
            "declined"
        ].includes(normalized);

    messageClientButton.disabled =
        !currentBooking?.clientId;

    if (
        normalized === "completed" ||
        normalized === "cancelled" ||
        normalized === "declined"
    ) {
        navigationButton.disabled = true;
    } else {
        navigationButton.disabled = false;
    }
}


/* =========================================================
   UPDATE BOOKING STATUS
   ========================================================= */

async function updateBookingStatus(newStatus) {
    if (!currentUser) {
        showMessage(
            "You must be logged in."
        );
        return;
    }

    if (!currentBooking) {
        showMessage(
            "Booking information is not available."
        );
        return;
    }

    if (
        currentBooking.handymanId !==
        currentUser.uid
    ) {
        showMessage(
            "You are not assigned to this booking."
        );
        return;
    }

    const previousStatus =
        currentBooking.status;

    try {
        setActionLoading(true);


                if (!bookingSnapshot.exists()) {
                    throw new Error("Booking no longer exists.");
                }

                const previousStatus =
            currentBooking.clientName ||
            "Client";
                transaction.update(
                    bookingRef,
                    {
                        status: newStatus,
                        statusHistory: arrayUnion({
                            status: newStatus,
                            actorId: currentUser.uid,
                            actorRole: "handyman",
                            at: Date.now()
                        }),
                        updatedAt: serverTimestamp()
                    }
                );

                if (newStatus === "completed" && previousStatus !== "completed") {
                    transaction.update(
                        doc(db, "users", currentUser.uid),
                        { completedJobs: increment(1) }
                    );
                }
            });
        } catch (historyError) {
            if (historyError.code !== "permission-denied") {
                throw historyError;
            }

            try {
                await updateDoc(
                    bookingRef,
                    {
                        status: newStatus,
                        statusHistory: arrayUnion({
                            status: newStatus,
                            actorId: currentUser.uid,
                            actorRole: "handyman",
                            at: Date.now()
                        }),
                        updatedAt: serverTimestamp()
                    }
                );
            } catch (timelineError) {
                if (timelineError.code !== "permission-denied") {
                    throw timelineError;
                }

                await updateDoc(
                    bookingRef,
                    { status: newStatus, updatedAt: serverTimestamp() }
                );
            }
        }

        showMessage(
            "Job status updated successfully.",
            "success"
        );

    } catch (error) {
        console.error(
            "HANDY JOB STATUS UPDATE ERROR:",
            error
        );

        console.error(
            "Previous status:",
            previousStatus
        );

        if (
            error.code ===
            "permission-denied"
        ) {
            showMessage(
                "Firebase denied this update. Check your Firestore booking rules."
            );
        } else {
            showMessage(
                error.message ||
                "Unable to update the job."
            );
        }

    } finally {
        setActionLoading(false);
    }
}


/* =========================================================
   ACTION LOADING
   ========================================================= */

function setActionLoading(loading) {
    const buttons = [
        arrivedButton,
        startJobButton,
        completeJobButton,
        cancelJobButton
    ];

    buttons.forEach(button => {
        if (loading) {
            button.dataset.originalText =
                button.textContent;

            button.disabled = true;
        }
    });

    if (!loading && currentBooking) {
        updateActionButtons(
            currentBooking.status
        );
    }
}


/* =========================================================
   MESSAGE CLIENT
   ========================================================= */

async function messageClient() {
    if (!currentUser) return;

    const clientId =
        currentBooking?.clientId;

    if (!clientId) {
        showMessage(
            "This booking does not have a client assigned."
        );
        return;
    }

    try {
        const clientRef =
            doc(db, "users", clientId);

        const clientSnapshot =
            await getDoc(clientRef);

        const clientData =
            clientSnapshot.exists()
                ? clientSnapshot.data()
                : {};

        const handymanName =
            currentHandyman?.name ||
            currentUser.displayName ||
            "Handyman";

        const clientDisplayName =
            clientData.name ||
            clientData.displayName ||
            "Client";

        const conversationId = [
            currentUser.uid,
            clientId
        ]
            .sort()
            .join("_");

        const conversationRef =
            doc(
                db,
                "conversations",
                conversationId
            );

        const conversationSnapshot =
            await getDoc(
                conversationRef
            );

        if (!conversationSnapshot.exists()) {
            await setDoc(
                conversationRef,
                {
                    clientId: clientId,
                    handymanId: currentUser.uid,

                    clientName:
                        clientDisplayName,

                    handymanName:
                        handymanName,

                    bookingId:
                        currentBooking.id,

                    lastMessage: "",
                    lastSenderId: "",

                    createdAt:
                        serverTimestamp(),

                    updatedAt:
                        serverTimestamp()
                }
            );
        } else {
            await updateDoc(
                conversationRef,
                {
                    bookingId:
                        currentBooking.id,

                    updatedAt:
                        serverTimestamp()
                }
            );
        }

        window.location.href =
            `./handyman-chat.html?conversationId=${encodeURIComponent(conversationId)}&clientId=${encodeURIComponent(clientId)}`;

    } catch (error) {
        console.error(
            "HANDY JOB MESSAGE ERROR:",
            error
        );

        if (
            error.code ===
            "permission-denied"
        ) {
            showMessage(
                "Firebase denied access to this conversation."
            );
        } else {
            showMessage(
                "Unable to open the client chat."
            );
        }
    }
}


/* =========================================================
   CALL CLIENT
   ========================================================= */

function callClient() {
    if (!currentClient) {
        showMessage(
            "Client information is not available."
        );
        return;
    }

    const phone =
        currentClient.phone;

    if (!phone) {
        showMessage(
            "The client does not have a phone number."
        );
        return;
    }

    window.location.href =
        `tel:${encodeURIComponent(phone)}`;
}


/* =========================================================
   NAVIGATION
   ========================================================= */

function openNavigation() {
    if (!currentBooking) {
        showMessage(
            "Booking information is not available."
        );
        return;
    }

    const destination =
        currentBooking.location ||
        currentBooking.address ||
        currentBooking.serviceAddress ||
        currentBooking.clientLocation ||
        "";

    if (!destination) {
        showMessage(
            "No client location was provided."
        );
        return;
    }

    const mapsUrl =
        "https://www.google.com/maps/search/?api=1&query=" +
        encodeURIComponent(destination);

    window.open(
        mapsUrl,
        "_blank",
        "noopener,noreferrer"
    );
}


/* =========================================================
   BOOKING LISTENER
   ========================================================= */

function listenToBooking(bookingId) {
    if (!bookingId) {
        showMessage(
            "No booking was selected."
        );

        jobStatusText.textContent =
            "No booking selected";

        jobStatusBadge.textContent =
            "Unavailable";

        return;
    }

    if (unsubscribeBooking) {
        unsubscribeBooking();
    }

    const bookingRef =
        doc(
            db,
            "bookings",
            bookingId
        );

    unsubscribeBooking =
        onSnapshot(
            bookingRef,
            async snapshot => {

                if (!snapshot.exists()) {
                    showMessage(
                        "This booking no longer exists."
                    );

                    jobStatusText.textContent =
                        "Booking not found";

                    jobStatusBadge.textContent =
                        "Unavailable";

                    return;
                }

                const bookingData =
                    snapshot.data();

                if (
                    bookingData.handymanId !==
                    currentUser.uid
                ) {
                    showMessage(
                        "This booking is not assigned to your account."
                    );

                    return;
                }

                currentBooking = {
                    id: snapshot.id,
                    ...bookingData
                };

                renderBooking();

                await loadClient(
                    bookingData.clientId
                );
            },

            error => {
                console.error(
                    "HANDY JOB BOOKING LISTENER ERROR:",
                    error
                );

                if (
                    error.code ===
                    "permission-denied"
                ) {
                    showMessage(
                        "Firebase denied access to this booking."
                    );
                } else {
                    showMessage(
                        "Unable to load the booking."
                    );
                }
            }
        );
}


/* =========================================================
   MAP CONTROLS
   ========================================================= */

function updateMapZoom() {
    const map =
        document.querySelector(".job-map");

    const markers =
        document.querySelectorAll(".map-marker");

    if (!map) return;

    map.style.transform =
        `scale(${mapZoom})`;

    map.style.transformOrigin =
        "center";

    markers.forEach(marker => {
        marker.style.transform =
            `scale(${1 / mapZoom}) rotate(-45deg)`;
    });
}


function zoomIn() {
    mapZoom =
        Math.min(
            mapZoom + 0.1,
            1.5
        );

    updateMapZoom();
}


function zoomOut() {
    mapZoom =
        Math.max(
            mapZoom - 0.1,
            0.8
        );

    updateMapZoom();
}


function currentLocation() {
    showMessage(
        "Current location tracking will use the handyman's location data once GPS tracking is connected.",
        "success"
    );
}


/* =========================================================
   DASHBOARD
   ========================================================= */

function goToDashboard() {
    window.location.href =
        "./handyman-dashboard.html";
}


/* =========================================================
   AUTH
   ========================================================= */

onAuthStateChanged(
    auth,
    async user => {

        if (!user) {
            window.location.href =
                "../login.html";

            return;
        }

        currentUser = user;

        try {
            await loadHandyman();

            const handymanRef =
                doc(
                    db,
                    "users",
                    user.uid
                );

            const handymanSnapshot =
                await getDoc(handymanRef);

            if (
                !handymanSnapshot.exists()
            ) {
                showMessage(
                    "Your Handy account profile could not be found."
                );

                return;
            }

            const handymanData =
                handymanSnapshot.data();

            if (
                handymanData.role !==
                "handyman"
            ) {
                showMessage(
                    "This page is only available to handymen."
                );

                setTimeout(() => {
                    window.location.href =
                        "../login.html";
                }, 1200);

                return;
            }

            const bookingId =
                getBookingId();

            if (!bookingId) {
                showMessage(
                    "Open this page from a booking on your dashboard."
                );

                jobStatusText.textContent =
                    "No booking selected";

                jobStatusBadge.textContent =
                    "Unavailable";

                updateActionButtons("");

                return;
            }

            listenToBooking(
                bookingId
            );

        } catch (error) {
            console.error(
                "HANDY JOB AUTH ERROR:",
                error
            );

            showMessage(
                "Unable to load your Handy account."
            );
        }
    }
);


/* =========================================================
   EVENTS
   ========================================================= */

backToDashboard?.addEventListener(
    "click",
    goToDashboard
);

dashboardLink?.addEventListener(
    "click",
    event => {
        event.preventDefault();
        goToDashboard();
    }
);

messageClientButton?.addEventListener(
    "click",
    messageClient
);

callClientButton?.addEventListener(
    "click",
    callClient
);

navigationButton?.addEventListener(
    "click",
    openNavigation
);

arrivedButton?.addEventListener(
    "click",
    () => {
        updateBookingStatus(
            "arrived"
        );
    }
);

startJobButton?.addEventListener(
    "click",
    () => {
        updateBookingStatus(
            "in_progress"
        );
    }
);

completeJobButton?.addEventListener(
    "click",
    async () => {

        const confirmed =
            window.confirm(
                "Are you sure you want to mark this service as completed?"
            );

        if (!confirmed) return;

        await updateBookingStatus(
            "completed"
        );
    }
);

cancelJobButton?.addEventListener(
    "click",
    async () => {

        const confirmed =
            window.confirm(
                "Are you sure you want to cancel this job?"
            );

        if (!confirmed) return;

        await updateBookingStatus(
            "cancelled"
        );
    }
);

currentLocationButton?.addEventListener(
    "click",
    currentLocation
);

zoomInButton?.addEventListener(
    "click",
    zoomIn
);

zoomOutButton?.addEventListener(
    "click",
    zoomOut
);