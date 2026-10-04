import {
    auth,
    db
} from "../firebase-config.js";

import {
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    where,
    updateDoc,
    onSnapshot,
    serverTimestamp,
    arrayUnion,
    addDoc,
    increment,
    runTransaction
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";


/* =========================================================
   ELEMENTS
========================================================= */

const welcomeTitle =
    document.getElementById("welcomeTitle");

const headerAvatar =
    document.getElementById("headerAvatar");

const profileAvatar =
    document.getElementById("profileAvatar");

const profileName =
    document.getElementById("profileName");

const profileService =
    document.getElementById("profileService");

const profileEmail =
    document.getElementById("profileEmail");

const profilePhone =
    document.getElementById("profilePhone");

const profileExperience =
    document.getElementById("profileExperience");

const profileRating =
    document.getElementById("profileRating");

const availabilityText =
    document.getElementById("availabilityText");

const pendingCount =
    document.getElementById("pendingCount");

const upcomingCount =
    document.getElementById("upcomingCount");

const completedCount =
    document.getElementById("completedCount");

const bookingCount =
    document.getElementById("bookingCount");

const bookingList =
    document.getElementById("bookingList");

const recentClients =
    document.getElementById("recentClients");

const logoutButton =
    document.getElementById("logoutButton");


let currentUser = null;
let currentUserData = null;
let pendingContractBookingId = null;
let pendingQuoteBookingId = null;
let loadedBookings = [];
let scheduleWeekOffset = 0;
let selectedScheduleDate = "";

let unsubscribeBookings = null;


/* =========================================================
   HELPERS
========================================================= */

function escapeHTML(value) {

    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

}


function getInitial(name) {

    return (
        String(name || "H")
            .trim()
            .charAt(0)
            .toUpperCase() || "H"
    );

}


function formatDate(timestamp) {

    if (!timestamp) {
        return "No date";
    }

    try {

        const date =
            timestamp.toDate
                ? timestamp.toDate()
                : new Date(timestamp);

        return date.toLocaleDateString(
            [],
            {
                month: "short",
                day: "numeric",
                year: "numeric"
            }
        );

    } catch {

        return "No date";

    }

}


function toLocalDateKey(date) {
    const adjustedDate = new Date(date);
    adjustedDate.setMinutes(
        adjustedDate.getMinutes() - adjustedDate.getTimezoneOffset()
    );
    return adjustedDate.toISOString().slice(0, 10);
}


function getFilteredBookings(bookings) {
    const statusFilter =
        document.querySelector("#bookingStatusFilter")?.value || "all";
    const searchTerm =
        document.querySelector("#bookingSearchFilter")?.value?.trim().toLowerCase() || "";

    return bookings.filter(booking => {
        const status = String(booking.status || "pending").toLowerCase();
        const activeStatuses = [
            "accepted",
            "confirmed",
            "scheduled",
            "on_the_way",
            "arrived",
            "in_progress"
        ];

        if (statusFilter === "pending" && status !== "pending") return false;
        if (statusFilter === "upcoming" && !activeStatuses.includes(status)) return false;
        if (statusFilter === "completed" && status !== "completed") return false;
        if (selectedScheduleDate && booking.date !== selectedScheduleDate) return false;

        if (searchTerm) {
            const searchable = `${booking.clientName || ""} ${booking.serviceName || booking.service || ""}`.toLowerCase();
            if (!searchable.includes(searchTerm)) return false;
        }

        return true;
    });
}


function renderWeeklyCalendar(bookings) {
    const calendar = document.querySelector("#handymanWeekCalendar");
    const weekLabel = document.querySelector("#scheduleWeekLabel");

    if (!calendar) {
        return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const monday = new Date(today);
    monday.setDate(
        monday.getDate() - ((monday.getDay() + 6) % 7) + scheduleWeekOffset * 7
    );

    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);

    if (weekLabel) {
        const dateFormatter = new Intl.DateTimeFormat(undefined, {
            month: "short",
            day: "numeric"
        });
        weekLabel.textContent = `${dateFormatter.format(monday)} - ${dateFormatter.format(sunday)}`;
    }

    const dayFormatter = new Intl.DateTimeFormat(undefined, { weekday: "short" });

    calendar.innerHTML = `
        <div class="hd-week-grid">
            ${Array.from({ length: 7 }, (_, index) => {
                const day = new Date(monday);
                day.setDate(monday.getDate() + index);
                const dateKey = toLocalDateKey(day);
                const dayBookings = bookings.filter(booking => booking.date === dateKey);

                return `
                    <button
                        type="button"
                        class="hd-week-day ${selectedScheduleDate === dateKey ? "active" : ""}"
                        data-calendar-date="${dateKey}"
                        aria-pressed="${selectedScheduleDate === dateKey}"
                    >
                        <strong>${escapeHTML(dayFormatter.format(day))} ${day.getDate()}</strong>
                        <span>${dayBookings.length} booking${dayBookings.length === 1 ? "" : "s"}</span>
                    </button>
                `;
            }).join("")}
        </div>
    `;
}


function renderFilteredBookings() {
    renderBookings(getFilteredBookings(loadedBookings));
}


function setupBookingDashboardControls() {
    document.querySelector("#previousScheduleWeek")?.addEventListener("click", () => {
        scheduleWeekOffset -= 1;
        renderWeeklyCalendar(loadedBookings);
    });

    document.querySelector("#nextScheduleWeek")?.addEventListener("click", () => {
        scheduleWeekOffset += 1;
        renderWeeklyCalendar(loadedBookings);
    });

    document.querySelector("#clearScheduleDateFilter")?.addEventListener("click", () => {
        selectedScheduleDate = "";
        renderWeeklyCalendar(loadedBookings);
        renderFilteredBookings();
    });

    document.querySelector("#handymanWeekCalendar")?.addEventListener("click", event => {
        const dayButton = event.target.closest("[data-calendar-date]");
        if (!dayButton) return;

        selectedScheduleDate = selectedScheduleDate === dayButton.dataset.calendarDate
            ? ""
            : dayButton.dataset.calendarDate;

        renderWeeklyCalendar(loadedBookings);
        renderFilteredBookings();
    });

    ["#bookingStatusFilter", "#bookingSearchFilter"].forEach(selector => {
        document.querySelector(selector)?.addEventListener(
            selector === "#bookingSearchFilter" ? "input" : "change",
            renderFilteredBookings
        );
    });

    document
        .querySelectorAll("[data-close-quote]")
        .forEach(button => {
            button.addEventListener("click", closeBookingQuote);
        });

    document
        .querySelector("#sendQuoteButton")
        ?.addEventListener("click", sendBookingQuote);
}


/* =========================================================
   LOAD HANDYMAN PROFILE
========================================================= */

async function loadProfile(
    user
) {

    const userRef =
        doc(
            db,
            "users",
            user.uid
        );


    const snapshot =
        await getDoc(
            userRef
        );


    if (!snapshot.exists()) {

        await signOut(auth);

        window.location.href =
            "../login.html";

        return false;
    }


    const data =
        snapshot.data();


    if (
        data.role !==
        "handyman"
    ) {

        await signOut(auth);

        window.location.href =
            "../login.html";

        return false;
    }


    currentUserData =
        data;


    const name =
        data.name ||
        user.displayName ||
        "Handyman";


    const service =
        data.serviceName ||
        data.serviceCategory ||
        "Handyman service";


    const initial =
        getInitial(name);


    welcomeTitle.textContent =
        `Welcome back, ${name.split(" ")[0]}`;


    profileName.textContent =
        name;


    profileService.textContent =
        service;


    profileEmail.textContent =
        data.email ||
        user.email ||
        "-";


    profilePhone.textContent =
        data.phone ||
        "-";


    profileExperience.textContent =
        data.experience ||
        "Not specified";


    profileAvatar.textContent =
        initial;


    headerAvatar.textContent =
        initial;


    availabilityText.textContent =
        data.isAvailable === false
            ? "Currently unavailable"
            : "Available";


    return true;

}


/* =========================================================
   LOAD RATING
========================================================= */

async function loadRating(
    handymanId
) {

    try {

        const reviewsQuery =
            query(
                collection(
                    db,
                    "reviews"
                ),
                where(
                    "handymanId",
                    "==",
                    handymanId
                )
            );


        const snapshot =
            await getDocs(
                reviewsQuery
            );


        if (snapshot.empty) {

            profileRating.textContent =
                "0.0";

            return;

        }


        let total =
            0;


        snapshot.forEach(
            item => {

                total +=
                    Number(
                        item.data().rating ||
                        0
                    );

            }
        );


        profileRating.textContent =
            (
                total /
                snapshot.size
            ).toFixed(1);


    } catch (error) {

        console.error(
            "HANDYMAN RATING ERROR:",
            error
        );

        profileRating.textContent =
            "0.0";

    }

}


/* =========================================================
   LOAD BOOKINGS REALTIME
========================================================= */

function loadBookings(
    handymanId
) {

    const bookingsQuery =
        query(
            collection(
                db,
                "bookings"
            ),
            where(
                "handymanId",
                "==",
                handymanId
            )
        );


    unsubscribeBookings =
        onSnapshot(
            bookingsQuery,
            snapshot => {

                const bookings =
                    snapshot.docs.map(
                        item => ({
                            id: item.id,
                            ...item.data()
                        })
                    );


                bookings.sort(
                    (a, b) => {

                        const first =
                            a.createdAt?.seconds ||
                            0;

                            loadedBookings = bookings;

                        const second =
                            b.createdAt?.seconds ||
                            0;

                        return second - first;

                    }
                );


                updateStatistics(
                    bookings
                );


                renderWeeklyCalendar(bookings);

                renderFilteredBookings();


                renderRecentClients(
                    bookings
                );

            },
            error => {

                console.error(
                    "HANDYMAN BOOKINGS ERROR:",
                    error
                );


                bookingList.innerHTML = `
                    <div class="hd-error">
                        Unable to load your bookings.
                    </div>
                `;

            }
        );

}


/* =========================================================
   STATISTICS
========================================================= */

function updateStatistics(
    bookings
) {

    const pending =
        bookings.filter(
            booking =>
                booking.status ===
                "pending"
        ).length;


    const upcoming =
        bookings.filter(
            booking =>
                booking.status ===
                "accepted" ||
                booking.status ===
                "confirmed" ||
                booking.status ===
                    "scheduled" ||
                booking.status ===
                    "on_the_way" ||
                booking.status ===
                    "arrived" ||
                booking.status ===
                    "in_progress"
        ).length;


    const completed =
        bookings.filter(
            booking =>
                booking.status ===
                "completed"
        ).length;


    pendingCount.textContent =
        pending;

    upcomingCount.textContent =
        upcoming;

    completedCount.textContent =
        completed;


    bookingCount.textContent =
        `${bookings.length} booking${bookings.length === 1 ? "" : "s"}`;

}


/* =========================================================
   RENDER BOOKINGS
========================================================= */

function renderBookings(
    bookings
) {

    if (!bookings.length) {

        bookingList.innerHTML = `
            <div class="hd-empty">
                ${loadedBookings.length ? "No bookings match these filters." : "No client bookings yet."}
            </div>
        `;

        return;
    }


    bookingList.innerHTML =
        bookings
            .slice(0, 10)
            .map(
                booking => {

                    const clientName =
                        booking.clientName ||
                        "Client";


                    const service =
                        booking.serviceName ||
                        booking.service ||
                        "Handyman service";


                    const location =
                        booking.location ||
                        booking.address ||
                        "Location not provided";


                    const date =
                        booking.date ||
                        formatDate(
                            booking.scheduledAt
                        );


                    const time =
                        booking.time ||
                        "Time not specified";


                    const status =
                        booking.status ||
                        "pending";

                    const paymentDetails =
                        booking.paymentMethod === "GCash"
                            ? booking.paymentDetails?.gcashNumber || "Not provided"
                            : booking.paymentMethod === "Bank transfer"
                                ? [
                                    booking.paymentDetails?.bankName,
                                    booking.paymentDetails?.transferReference
                                        ? `Reference: ${booking.paymentDetails.transferReference}`
                                        : ""
                                ].filter(Boolean).join(" · ") || "Not provided"
                                : booking.paymentMethod === "Cash"
                                    ? "Pay in person"
                                    : "Not provided";


                    return `
                        <article
                            class="hd-booking"
                            data-booking-id="${escapeHTML(booking.id)}"
                        >

                            <div class="hd-booking-top">

                                <div>

                                    <div class="hd-booking-name">
                                        ${escapeHTML(clientName)}
                                    </div>

                                    <div class="hd-booking-service">
                                        ${escapeHTML(service)}
                                    </div>

                                </div>

                                <span class="hd-status">
                                    ${escapeHTML(status)}
                                </span>

                            </div>


                            <div class="hd-booking-details">

                                <div class="hd-detail">

                                    <span>
                                        Date
                                    </span>

                                    <strong>
                                        ${escapeHTML(date)}
                                    </strong>

                                ${booking.quote ? `
                                    <div class="hd-detail">
                                        <span>Estimate</span>
                                        <strong>${escapeHTML(Number(booking.quote.amount || 0).toLocaleString("en-PH", { style: "currency", currency: "PHP" }))} · ${escapeHTML(booking.quote.status || "sent")}</strong>
                                    </div>
                                    ${booking.quote.clientNote ? `
                                        <div class="hd-detail">
                                            <span>Client response</span>
                                            <strong>${escapeHTML(booking.quote.clientNote)}</strong>
                                        </div>
                                    ` : ""}
                                ` : ""}

                                ${booking.rescheduleRequest?.status === "requested" ? `
                                    <div class="hd-booking-request">
                                        <p>Reschedule requested: ${escapeHTML(booking.rescheduleRequest.date || "")} ${escapeHTML(booking.rescheduleRequest.time || "")}</p>
                                        <p>${escapeHTML(booking.rescheduleRequest.reason || "")}</p>
                                        <button type="button" class="hd-button hd-button-primary" data-action="change-response" data-kind="reschedule" data-decision="approved" data-id="${escapeHTML(booking.id)}" data-client="${escapeHTML(booking.clientId || "")}">Approve</button>
                                        <button type="button" class="hd-button hd-button-danger" data-action="change-response" data-kind="reschedule" data-decision="rejected" data-id="${escapeHTML(booking.id)}" data-client="${escapeHTML(booking.clientId || "")}">Decline</button>
                                    </div>
                                ` : ""}

                                ${booking.cancellationRequest?.status === "requested" ? `
                                    <div class="hd-booking-request">
                                        <p>Cancellation requested</p>
                                        <p>${escapeHTML(booking.cancellationRequest.reason || "")}</p>
                                        <button type="button" class="hd-button hd-button-danger" data-action="change-response" data-kind="cancellation" data-decision="approved" data-id="${escapeHTML(booking.id)}" data-client="${escapeHTML(booking.clientId || "")}">Approve cancellation</button>
                                        <button type="button" class="hd-button hd-button-secondary" data-action="change-response" data-kind="cancellation" data-decision="rejected" data-id="${escapeHTML(booking.id)}" data-client="${escapeHTML(booking.clientId || "")}">Decline</button>
                                    </div>
                                ` : ""}

                                </div>

                                <div class="hd-detail">

                                    <span>
                                        Payment status
                                    </span>

                                    <strong>
                                        ${escapeHTML(
                                            !booking.paymentMethod
                                                ? "Not specified"
                                                : booking.paymentStatus === "paid"
                                                    ? "Confirmed received"
                                                    : booking.paymentStatus === "client_reported_paid"
                                                        ? "Client reported paid"
                                                        : "Unpaid"
                                        )}
                                    </strong>

                                </div>


                                <div class="hd-detail">

                                    <span>
                                        Time
                                    </span>

                                    <strong>
                                        ${escapeHTML(time)}
                                    </strong>

                                </div>


                                <div class="hd-detail">

                                    <span>
                                        Location
                                    </span>

                                    <strong>
                                        ${escapeHTML(location)}
                                    </strong>

                                </div>


                                <div class="hd-detail">

                                    <span>
                                        Client mobile
                                    </span>

                                    <strong>
                                        ${escapeHTML(
                                            booking.clientMobile ||
                                            booking.clientPhone ||
                                            "Not provided"
                                        )}
                                    </strong>

                                </div>


                                <div class="hd-detail">

                                    <span>
                                        Payment method
                                    </span>

                                    <strong>
                                        ${escapeHTML(booking.paymentMethod || "Not specified")}
                                    </strong>

                                </div>


                                <div class="hd-detail">

                                    <span>
                                        Payment details
                                    </span>

                                    <strong>
                                        ${escapeHTML(paymentDetails)}
                                    </strong>

                                </div>

                                ${
                                    booking.photoURL
                                        ? `
                                            <div class="hd-detail">
                                                <span>Attached photo</span>
                                                <strong>
                                                    <a href="${escapeHTML(booking.photoURL)}" target="_blank" rel="noopener noreferrer">View photo</a>
                                                </strong>
                                            </div>
                                        `
                                        : ""
                                }

                            </div>


                            <div class="hd-booking-actions">

                                ${
                                    status === "pending"
                                        ? `
                                            <button
                                                type="button"
                                                class="hd-button hd-button-primary"
                                                data-action="accept"
                                                data-id="${escapeHTML(booking.id)}"
                                            >
                                                Accept booking
                                            </button>

                                            <button
                                                type="button"
                                                class="hd-button hd-button-danger"
                                                data-action="decline"
                                                data-id="${escapeHTML(booking.id)}"
                                            >
                                                Decline
                                            </button>
                                        `
                                        : ""
                                }

                                ${
                                    !["declined", "cancelled", "completed"].includes(status)
                                        ? `
                                            <button
                                                type="button"
                                                class="hd-button hd-button-secondary"
                                                data-action="quote"
                                                data-id="${escapeHTML(booking.id)}"
                                            >
                                                ${booking.quote?.status === "sent" || booking.quote?.status === "accepted" ? "Update estimate" : "Send estimate"}
                                            </button>
                                          `
                                        : ""
                                }


                                ${
                                    status === "accepted" ||
                                    status === "confirmed" ||
                                    status === "scheduled"
                                        ? `
                                            <button
                                                type="button"
                                                class="hd-button hd-button-primary"
                                                data-action="message"
                                                data-id="${escapeHTML(booking.id)}"
                                                data-client="${escapeHTML(booking.clientId || "")}"
                                                data-client-name="${escapeHTML(clientName)}"
                                            >
                                                Message client
                                            </button>

                                            ${booking.clientPhone || booking.clientMobile ? `
                                                <a class="hd-button hd-button-secondary" href="tel:${escapeHTML(booking.clientPhone || booking.clientMobile)}">Call client</a>
                                            ` : ""}

                                            ${location !== "Location not provided" ? `
                                                <a class="hd-button hd-button-secondary" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}" target="_blank" rel="noopener noreferrer">Directions</a>
                                            ` : ""}

                                            <button
                                                type="button"
                                                class="hd-button hd-button-secondary"
                                                data-action="complete"
                                                data-id="${escapeHTML(booking.id)}"
                                            >
                                                Mark completed
                                            </button>
                                        `
                                        : ""
                                }


                                ${
                                    status === "completed"
                                        ? `
                                            <button
                                                type="button"
                                                class="hd-button hd-button-secondary"
                                                data-action="message"
                                                data-id="${escapeHTML(booking.id)}"
                                                data-client="${escapeHTML(booking.clientId || "")}"
                                                data-client-name="${escapeHTML(clientName)}"
                                            >
                                                Message client
                                            </button>
                                        `
                                        : ""
                                }

                                ${
                                    booking.paymentStatus === "client_reported_paid"
                                        ? `
                                            <button
                                                type="button"
                                                class="hd-button hd-button-secondary"
                                                data-action="confirm-payment"
                                                data-id="${escapeHTML(booking.id)}"
                                                data-client="${escapeHTML(booking.clientId || "")}" 
                                            >
                                                Confirm payment received
                                            </button>
                                        `
                                        : ""
                                }

                            </div>

                        </article>
                    `;

                }
            )
            .join("");


    attachBookingActions();

}


/* =========================================================
   RECENT CLIENTS
========================================================= */

function renderRecentClients(
    bookings
) {

    if (!bookings.length) {

        recentClients.innerHTML = `
            <div class="hd-empty">
                Client activity will appear here.
            </div>
        `;

        return;
    }


    recentClients.innerHTML =
        bookings
            .slice(0, 5)
            .map(
                booking => {

                    const name =
                        booking.clientName ||
                        "Client";


                    const service =
                        booking.serviceName ||
                        booking.service ||
                        "Service";


                    const status =
                        booking.status ||
                        "pending";


                    return `
                        <article class="hd-booking">

                            <div class="hd-booking-top">

                                <div>

                                    <div class="hd-booking-name">
                                        ${escapeHTML(name)}
                                    </div>

                                    <div class="hd-booking-service">
                                        ${escapeHTML(service)}
                                    </div>

                                </div>

                                <span class="hd-status">
                                    ${escapeHTML(status)}
                                </span>

                            </div>

                        </article>
                    `;

                }
            )
            .join("");

}


/* =========================================================
   BOOKING ACTIONS
========================================================= */

function openContractModal(bookingId) {

    pendingContractBookingId = bookingId;

    const modal =
        document.getElementById(
            "bookingContractModal"
        );

    const checkbox =
        document.getElementById(
            "bookingContractCheckbox"
        );

    if (checkbox) {
        checkbox.checked = false;
    }

    if (modal) {
        modal.classList.add("active");
    }

}


function closeContractModal() {

    const modal =
        document.getElementById(
            "bookingContractModal"
        );

    const checkbox =
        document.getElementById(
            "bookingContractCheckbox"
        );

    if (checkbox) {
        checkbox.checked = false;
    }

    if (modal) {
        modal.classList.remove("active");
    }

    pendingContractBookingId = null;

}


function attachBookingActions() {

    document
        .querySelectorAll(
            "[data-action]"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                async () => {

                    const action =
                        button.dataset.action;

                    const bookingId =
                        button.dataset.id;


                    if (
                        action ===
                        "message"
                    ) {

                        await openClientChat(
                            bookingId,
                            button.dataset.client,
                            button.dataset.clientName
                        );

                        return;
                    }


                    if (
                        action ===
                        "accept"
                    ) {

                        openContractModal(
                            bookingId
                        );

                        return;
                    }


                    if (
                        action ===
                        "decline"
                    ) {

                        await updateBookingStatus(
                            bookingId,
                            "declined"
                        );

                        return;
                    }


                    if (
                        action ===
                        "complete"
                    ) {

                        await updateBookingStatus(
                            bookingId,
                            "completed"
                        );

                        return;

                    }

                    if (action === "confirm-payment") {
                        await confirmBookingPayment(
                            bookingId,
                            button.dataset.client
                        );

                    }

                    if (action === "quote") {
                        openBookingQuote(bookingId);
                        return;
                    }

                    if (action === "change-response") {
                        await respondToClientChange(
                            bookingId,
                            button.dataset.kind,
                            button.dataset.decision,
                            button.dataset.client
                        );
                    }

                }
            );

        });

    const acceptContractButton =
        document.getElementById(
            "confirmBookingContractButton"
        );

    if (acceptContractButton) {

        acceptContractButton.addEventListener(
            "click",
            async () => {

                const checkbox =
                    document.getElementById(
                        "bookingContractCheckbox"
                    );

                if (!checkbox || !checkbox.checked) {
                    alert(
                        "Please read the contract and confirm that you agree before accepting this booking."
                    );
                    return;
                }

                if (!pendingContractBookingId) {
                    return;
                }

                await updateBookingStatus(
                    pendingContractBookingId,
                    "accepted"
                );

                await updateDoc(
                    doc(
                        db,
                        "bookings",
                        pendingContractBookingId
                    ),
                    {
                        contractAccepted: true,
                        contractAcceptedBy: currentUser.uid,
                        contractAcceptedAt: serverTimestamp(),
                        contractText: "Handyman confirms reading and accepting the job agreement before accepting the booking."
                    }
                );

                closeContractModal();

            }
        );

    }

    document
        .querySelectorAll(
            "[data-close-contract]"
        )
        .forEach(button => {
            button.addEventListener(
                "click",
                closeContractModal
            );
        });

}


function openBookingQuote(bookingId) {
    pendingQuoteBookingId = bookingId;
    const booking = loadedBookings.find(item => item.id === bookingId);
    const amountInput = document.querySelector("#quoteAmountInput");
    const scopeInput = document.querySelector("#quoteScopeInput");

    if (amountInput) amountInput.value = booking?.quote?.amount || "";
    if (scopeInput) scopeInput.value = booking?.quote?.scope || "";
    document.querySelector("#bookingQuoteModal")?.classList.add("active");
}


function closeBookingQuote() {
    pendingQuoteBookingId = null;
    document.querySelector("#bookingQuoteModal")?.classList.remove("active");
}


async function sendBookingQuote() {
    if (!pendingQuoteBookingId || !currentUser) return;

    const booking = loadedBookings.find(item => item.id === pendingQuoteBookingId);
    const amount = Number(document.querySelector("#quoteAmountInput")?.value || 0);
    const scope = document.querySelector("#quoteScopeInput")?.value?.trim() || "";
    const sendButton = document.querySelector("#sendQuoteButton");

    if (!booking || !Number.isFinite(amount) || amount <= 0 || scope.length < 5) {
        alert("Enter a valid amount and describe the work included.");
        return;
    }

    sendButton.disabled = true;

    try {
        await updateDoc(
            doc(db, "bookings", booking.id),
            {
                quote: {
                    amount,
                    currency: "PHP",
                    scope,
                    status: "sent",
                    sentBy: currentUser.uid,
                    sentAt: Date.now()
                },
                updatedAt: serverTimestamp()
            }
        );

        await notifyBookingUser(
            booking.clientId,
            booking.id,
            "Estimate received",
            `${currentUserData?.name || "Your handyman"} sent an estimate for ${booking.serviceName || "your booking"}.`,
            "quote"
        );

        closeBookingQuote();
    } catch (error) {
        console.error("SEND BOOKING QUOTE ERROR:", error);
        alert("Unable to send the estimate.");
    } finally {
        sendButton.disabled = false;
    }
}


async function respondToClientChange(bookingId, kind, decision, clientId) {
    const booking = loadedBookings.find(item => item.id === bookingId);
    const requestField = kind === "reschedule" ? "rescheduleRequest" : "cancellationRequest";
    const request = booking?.[requestField];

    if (!booking || !request || request.status !== "requested") {
        return;
    }

    const updates = {
        [requestField]: {
            ...request,
            status: decision,
            respondedBy: currentUser.uid,
            respondedAt: Date.now()
        },
        updatedAt: serverTimestamp()
    };

    if (decision === "approved" && kind === "reschedule") {
        const schedule = currentUserData?.availabilitySchedule;
        const proposedDate = new Date(`${request.date}T12:00:00`);

        if (
            !request.date ||
            !request.time ||
            !isAvailableForHandymanSchedule(schedule, request.date, request.time, proposedDate)
        ) {
            alert("That requested time is outside your working schedule.");
            return;
        }

        const conflict = loadedBookings.some(item =>
            item.id !== bookingId &&
            item.date === request.date &&
            item.time === request.time &&
            !["declined", "cancelled", "completed"].includes(item.status)
        );

        if (conflict) {
            alert("You already have a booking at that time.");
            return;
        }

        updates.date = request.date;
        updates.time = request.time;
    }

    if (decision === "approved" && kind === "cancellation") {
        updates.status = "cancelled";
        updates.statusHistory = arrayUnion({
            status: "cancelled",
            actorId: currentUser.uid,
            actorRole: "handyman",
            at: Date.now()
        });
    }

    try {
        await updateDoc(doc(db, "bookings", bookingId), updates);
        await notifyBookingUser(
            clientId || booking.clientId,
            bookingId,
            decision === "approved" ? "Booking change approved" : "Booking change declined",
            decision === "approved"
                ? kind === "reschedule"
                    ? `Your booking was moved to ${request.date} at ${request.time}.`
                    : "Your cancellation request was approved."
                : `Your ${kind} request was declined.`,
            "booking_change"
        );
    } catch (error) {
        console.error("BOOKING CHANGE RESPONSE ERROR:", error);
        alert("Unable to update this booking request.");
    }
}


function isAvailableForHandymanSchedule(schedule, date, time, parsedDate) {
    if (!schedule || schedule.enabled !== true) {
        return true;
    }

    const dateToCheck = parsedDate || new Date(`${date}T12:00:00`);
    return (
        Array.isArray(schedule.days) &&
        schedule.days.includes(dateToCheck.getDay()) &&
        !schedule.unavailableDates?.includes(date) &&
        time >= schedule.start &&
        time < schedule.end
    );
}


async function notifyBookingUser(userId, bookingId, title, message, type) {
    if (!userId) return;

    try {
        await addDoc(
            collection(db, "notifications"),
            {
                userId,
                title,
                message,
                type,
                relatedId: bookingId,
                read: false,
                createdBy: currentUser.uid,
                createdAt: serverTimestamp()
            }
        );
    } catch (error) {
        console.error("BOOKING NOTIFICATION ERROR:", error);
    }
}


/* =========================================================
   UPDATE BOOKING STATUS
========================================================= */

async function updateBookingStatus(
    bookingId,
    status
) {

    try {

        const bookingRef =
            doc(
                db,
                "bookings",
                bookingId
            );


        try {
            await runTransaction(db, async transaction => {
                const bookingSnapshot =
                    await transaction.get(bookingRef);

                if (!bookingSnapshot.exists()) {
                    throw new Error("Booking no longer exists.");
                }

                const previousStatus =
                    bookingSnapshot.data().status;

                transaction.update(
                    bookingRef,
                    {
                        status,
                        statusHistory: arrayUnion({
                            status,
                            actorId: currentUser.uid,
                            actorRole: "handyman",
                            at: Date.now()
                        }),
                        updatedAt: serverTimestamp()
                    }
                );

                if (status === "completed" && previousStatus !== "completed") {
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
                        status,
                        statusHistory: arrayUnion({
                            status,
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
                    { status, updatedAt: serverTimestamp() }
                );
            }
        }

        const booking = loadedBookings.find(item => item.id === bookingId);

        if (booking?.clientId) {
            const statusLabels = {
                accepted: "accepted",
                declined: "declined",
                completed: "marked complete"
            };

            await notifyBookingUser(
                booking.clientId,
                bookingId,
                `Booking ${statusLabels[status] || status.replaceAll("_", " ")}`,
                `${currentUserData?.name || "Your handyman"} ${statusLabels[status] || `updated the booking to ${status.replaceAll("_", " ")}`}.`,
                "booking"
            );
        }


    } catch (error) {

        console.error(
            "BOOKING STATUS ERROR:",
            error
        );


        if (
            error.code ===
            "permission-denied"
        ) {

            alert(
                "Firebase blocked this booking update. Check your Firestore rules."
            );

        } else {

            alert(
                "Unable to update the booking."
            );

        }

    }

}


/* =========================================================
   OPEN CLIENT CHAT
========================================================= */

async function openClientChat(
    bookingId,
    clientId,
    clientName
) {

    if (!clientId) {

        alert(
            "This booking does not have a valid client ID."
        );

        return;
    }

    try {

        const conversationId =
            [
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


        const existing =
            await getDoc(
                conversationRef
            );


        if (!existing.exists()) {

            await import(
                "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js"
            )
            .then(
                async firestore => {

                    await firestore.setDoc(
                        conversationRef,
                        {
                            clientId:
                                clientId,

                            handymanId:
                                currentUser.uid,

                            clientName:
                                clientName ||
                                "Client",

                            handymanName:
                                currentUserData?.name ||
                                currentUser.displayName ||
                                "Handyman",

                            bookingId:
                                bookingId,

                            lastMessage:
                                "",

                            lastSenderId:
                                "",

                            createdAt:
                                firestore.serverTimestamp(),

                            updatedAt:
                                firestore.serverTimestamp()
                        }
                    );

                }
            );

        }


        window.location.href =
            "./handyman-chat.html";


    } catch (error) {

        console.error(
            "OPEN CLIENT CHAT ERROR:",
            error
        );


        alert(
            error.code === "permission-denied"
                ? "Firebase blocked the conversation. Check your Firestore rules."
                : "Unable to open the client chat."
        );

    }

}


async function confirmBookingPayment(bookingId, clientId) {
    try {
        await updateDoc(
            doc(db, "bookings", bookingId),
            {
                paymentStatus: "paid",
                paymentConfirmedAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            }
        );

        if (clientId) {
            try {
                await addDoc(
                    collection(db, "notifications"),
                    {
                        userId: clientId,
                        title: "Payment confirmed",
                        message: "Your handyman confirmed receiving payment.",
                        type: "payment",
                        relatedId: bookingId,
                        read: false,
                        createdBy: currentUser.uid,
                        createdAt: serverTimestamp()
                    }
                );
            } catch (notificationError) {
                console.error("PAYMENT NOTIFICATION ERROR:", notificationError);
            }
        }
    } catch (error) {
        console.error("PAYMENT CONFIRMATION ERROR:", error);
        alert("Unable to confirm payment received.");
    }
}


/* =========================================================
   LOGOUT
========================================================= */

logoutButton?.addEventListener(
    "click",
    async () => {

        try {

            if (unsubscribeBookings) {
                unsubscribeBookings();
            }

            await signOut(
                auth
            );

            window.location.href =
                "../login.html";

        } catch (error) {

            console.error(
                "HANDYMAN LOGOUT ERROR:",
                error
            );

        }

    }
);


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


        currentUser =
            user;


        try {

            const profileLoaded =
                await loadProfile(
                    user
                );


            if (!profileLoaded) {
                return;
            }

            setupBookingDashboardControls();


            await loadRating(
                user.uid
            );


            loadBookings(
                user.uid
            );


        } catch (error) {

            console.error(
                "HANDYMAN DASHBOARD ERROR:",
                error
            );


            bookingList.innerHTML = `
                <div class="hd-error">
                    Unable to load your dashboard.
                </div>
            `;

        }

    }
);