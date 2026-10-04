import {
    app,
    auth,
    db
} from "../firebase-config.js";

import {
    getDownloadURL,
    getStorage,
    ref,
    uploadBytes
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js";

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
    onSnapshot,
    addDoc,
    updateDoc,
    setDoc,
    serverTimestamp,
    orderBy,
    arrayUnion
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const storage = getStorage(app);


// ======================================================
// GLOBAL STATE
// ======================================================

let currentUser = null;
let currentProfile = null;

let handymanList = [];
let handymanReviews = {};
const comparedHandymanIds = new Set();

let clientLatitude = null;
let clientLongitude = null;

let selectedHandyman = null;
let selectedRatingBooking = null;
let selectedReportBooking = null;
let selectedChangeBooking = null;
let bookingChangeMode = "";
let selectedRating = 0;
let isBookingSubmitting = false;
let clientBookings = [];
let clientReports = [];

let unsubscribeHandymen = null;
let unsubscribeBookings = null;
let unsubscribeReports = null;
let unsubscribeReviews = null;
let unsubscribeNotifications = null;
let unsubscribeConversations = null;


// ======================================================
// HELPERS
// ======================================================

function escapeHTML(value) {
    if (value === null || value === undefined) return "";

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


function getTimestampMillis(value) {
    if (!value) return 0;

    if (typeof value.toMillis === "function") {
        return value.toMillis();
    }

    if (value.seconds) {
        return value.seconds * 1000;
    }

    if (value instanceof Date) {
        return value.getTime();
    }

    const parsed = new Date(value).getTime();

    return Number.isNaN(parsed) ? 0 : parsed;
}


function calculateDistanceKm(lat1, lon1, lat2, lon2) {
    if (
        lat1 === null ||
        lon1 === null ||
        lat2 === null ||
        lon2 === null
    ) {
        return null;
    }

    const earthRadius = 6371;

    const dLat =
        (lat2 - lat1) *
        Math.PI /
        180;

    const dLon =
        (lon2 - lon1) *
        Math.PI /
        180;

    const a =
        Math.sin(dLat / 2) *
        Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) *
        Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c =
        2 *
        Math.atan2(
            Math.sqrt(a),
            Math.sqrt(1 - a)
        );

    return earthRadius * c;
}


function getInitials(name) {
    if (!name) return "H";

    return name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map(word => word.charAt(0).toUpperCase())
        .join("");
}


function populateSavedAddressOptions() {
    const select = document.querySelector("#bookingSavedAddress");

    if (!select) {
        return;
    }

    const savedAddresses = [
        ...(Array.isArray(currentProfile?.savedAddresses)
            ? currentProfile.savedAddresses
            : []),
        currentProfile?.address,
        currentProfile?.defaultServiceAddress
    ]
        .filter(address => typeof address === "string" && address.trim())
        .map(address => address.trim());

    select.replaceChildren(new Option("Choose a saved address", ""));

    [...new Set(savedAddresses)].forEach(address => {
        select.add(new Option(address, address));
    });
}


function getHandymanName(handyman) {
    return (
        handyman.name ||
        handyman.displayName ||
        handyman.fullName ||
        `${handyman.firstName || ""} ${handyman.lastName || ""}`.trim() ||
        "Handyman"
    );
}


function getHandymanService(handyman) {
    return (
        handyman.serviceName ||
        handyman.service ||
        handyman.category ||
        handyman.specialization ||
        "General Handyman"
    );
}


function handymanMatchesService(handyman, selectedService) {
    const services = [
        handyman.serviceName,
        handyman.service,
        handyman.serviceCategory,
        handyman.category,
        handyman.specialization,
        handyman.services,
        handyman.specialties
    ]
        .flatMap(value =>
            Array.isArray(value)
                ? value
                : typeof value === "string"
                    ? value.split(/[,;|]/)
                    : []
        )
        .map(value => String(value).trim().toLowerCase())
        .filter(Boolean);

    const aliases =
        selectedService === "carpenter"
            ? ["carpenter", "carpentry"]
            : [selectedService];

    return services.some(service =>
        aliases.some(alias =>
            service.includes(alias) || alias.includes(service)
        )
    );
}

function isHandymanOnline(handyman) {
    if (
        handyman.isAvailable === false ||
        handyman.availability === false
    ) {
        return false;
    }

    return (
        handyman.isAvailable === true ||
        handyman.availability === true ||
        handyman.isOnline === true ||
        handyman.online === true ||
        handyman.available === true ||
        handyman.status === "online" ||
        handyman.status === "available"
    );
}


function isHandymanAvailableForBooking(handyman, date, time) {
    if (
        handyman.isAvailable === false ||
        handyman.availability === false
    ) {
        return false;
    }

    const schedule = handyman.availabilitySchedule;

    if (
        date &&
        Array.isArray(schedule?.unavailableDates) &&
        schedule.unavailableDates.includes(date)
    ) {
        return false;
    }

    if (!schedule || schedule.enabled !== true) {
        return true;
    }

    if (!date || !time || !schedule.start || !schedule.end) {
        return false;
    }

    const bookingDate = new Date(`${date}T00:00:00`);

    return (
        !Number.isNaN(bookingDate.getTime()) &&
        Array.isArray(schedule.days) &&
        schedule.days.includes(bookingDate.getDay()) &&
        time >= schedule.start &&
        time < schedule.end
    );
}


function isHandymanVerified(handyman) {
    return (
        handyman.verified === true ||
        handyman.isVerified === true ||
        handyman.verificationStatus === "verified"
    );
}


// ======================================================
// AUTH
// ======================================================

onAuthStateChanged(auth, async user => {

    if (!user) {
        window.location.href = "../login.html";
        return;
    }

    currentUser = user;

    try {

        const userRef = doc(
            db,
            "users",
            user.uid
        );

        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
            console.error("User profile does not exist.");
            return;
        }

        currentProfile = {
            uid: user.uid,
            ...userSnap.data()
        };

        if (currentProfile.role !== "client") {
            window.location.href = "../login.html";
            return;
        }

        initializeDashboard();

    } catch (error) {

        console.error(
            "Authentication/profile error:",
            error
        );

    }

});


// ======================================================
// INITIALIZE
// ======================================================

function initializeDashboard() {

    loadClientProfile();

    setupHandymanRealtime();

    setupBookingRealtime();

    setupReportsRealtime();

    setupReviewRealtime();

    setupNotificationRealtime();

    setupLocation();

    setupDashboardEvents();

    setupRatingEvents();

    setupLogout();

}


// ======================================================
// CLIENT PROFILE
// ======================================================

function loadClientProfile() {

    const name =
        currentProfile.name ||
        currentProfile.displayName ||
        currentProfile.fullName ||
        `${currentProfile.firstName || ""} ${currentProfile.lastName || ""}`.trim() ||
        "Client";

    document
        .querySelectorAll("[data-client-name]")
        .forEach(element => {
            element.textContent = name;
        });

    document
        .querySelectorAll("[data-client-email]")
        .forEach(element => {
            element.textContent =
                currentProfile.email ||
                currentUser.email ||
                "";
        });

}


// ======================================================
// HANDYMAN REALTIME
// ======================================================

function setupHandymanRealtime() {

    if (unsubscribeHandymen) {
        unsubscribeHandymen();
    }

    const handymanQuery = query(
        collection(db, "users"),
        where("role", "==", "handyman")
    );

    unsubscribeHandymen = onSnapshot(
        handymanQuery,
        async snapshot => {

            const handymen = [];

            snapshot.forEach(handymanDoc => {

                const data = handymanDoc.data();

                handymen.push({
                    uid: handymanDoc.id,
                    ...data
                });

            });

            handymanList = handymen;

            await loadHandymanRatings();

            sortHandymen();

            renderHandymen();

            populateBookingHandymen();

            renderMapMarkers();

        },
        error => {

            console.error(
                "Handyman realtime error:",
                error
            );

        }
    );

}


// ======================================================
// REVIEWS
// ======================================================

async function loadHandymanRatings() {

    handymanReviews = {};

    try {

        const reviewSnapshot =
            await getDocs(
                collection(db, "reviews")
            );

        reviewSnapshot.forEach(reviewDoc => {

            const review =
                reviewDoc.data();

            if (!review.handymanId) {
                return;
            }

            if (!handymanReviews[review.handymanId]) {
                handymanReviews[review.handymanId] = [];
            }

            handymanReviews[
                review.handymanId
            ].push(review);

        });

        handymanList.forEach(handyman => {

            const reviews =
                handymanReviews[handyman.uid] || [];

            const total = reviews.reduce(
                (sum, review) =>
                    sum + Number(review.rating || 0),
                0
            );

            handyman.rating =
                reviews.length
                    ? total / reviews.length
                    : Number(handyman.rating || 0);

            handyman.reviewCount =
                reviews.length ||
                Number(handyman.reviewCount || 0);

        });

    } catch (error) {

        console.error(
            "Review loading error:",
            error
        );

    }

}


// ======================================================
// REVIEW REALTIME
// ======================================================

function setupReviewRealtime() {

    if (unsubscribeReviews) {
        unsubscribeReviews();
    }

    unsubscribeReviews = onSnapshot(
        collection(db, "reviews"),
        async () => {

            await loadHandymanRatings();

            sortHandymen();

            renderHandymen();

            renderMapMarkers();

        },
        error => {

            console.error(
                "Review realtime error:",
                error
            );

        }
    );

}


// ======================================================
// SORTING
// ======================================================

function sortHandymen() {

    const selectedService =
        document.querySelector(
            "#bookingService"
        )?.value?.trim().toLowerCase() || "";

    handymanList.sort((a, b) => {

        const aService =
            getHandymanService(a)
                .toLowerCase();

        const bService =
            getHandymanService(b)
                .toLowerCase();

        const aServiceMatch =
            selectedService &&
            handymanMatchesService(a, selectedService);

        const bServiceMatch =
            selectedService &&
            handymanMatchesService(b, selectedService);

        if (aServiceMatch !== bServiceMatch) {
            return bServiceMatch - aServiceMatch;
        }


        const verifiedA =
            isHandymanVerified(a);

        const verifiedB =
            isHandymanVerified(b);

        if (verifiedA !== verifiedB) {
            return verifiedB - verifiedA;
        }


        const onlineA =
            isHandymanOnline(a);

        const onlineB =
            isHandymanOnline(b);

        if (onlineA !== onlineB) {
            return onlineB - onlineA;
        }


        const ratingA =
            Number(a.rating || 0);

        const ratingB =
            Number(b.rating || 0);

        if (ratingA !== ratingB) {
            return ratingB - ratingA;
        }


        const reviewsA =
            Number(a.reviewCount || 0);

        const reviewsB =
            Number(b.reviewCount || 0);

        if (reviewsA !== reviewsB) {
            return reviewsB - reviewsA;
        }


        const distanceA =
            a.distanceKm ?? Infinity;

        const distanceB =
            b.distanceKm ?? Infinity;

        if (distanceA !== distanceB) {
            return distanceA - distanceB;
        }


        return getHandymanName(a)
            .localeCompare(
                getHandymanName(b)
            );

    });

}


// ======================================================
// RENDER HANDYMEN
// ======================================================

function showBookingSuccessToast() {
    const toast = document.getElementById("bookingSuccessToast");

    if (!toast) {
        return;
    }

    toast.classList.add("show");

    clearTimeout(showBookingSuccessToast.timeoutId);
    showBookingSuccessToast.timeoutId = setTimeout(() => {
        toast.classList.remove("show");
    }, 4200);
}

function getVisibleHandymen() {
    const searchTerm =
        document.querySelector("#handymanSearchFilter")?.value?.trim().toLowerCase() || "";
    const verificationFilter =
        document.querySelector("#handymanVerificationFilter")?.value || "all";
    const minimumRating =
        Number(document.querySelector("#handymanRatingFilter")?.value || 0);
    const maximumDistance =
        Number(document.querySelector("#handymanDistanceFilter")?.value || 0);

    return handymanList.filter(handyman => {
        const searchableText = [
            getHandymanName(handyman),
            getHandymanService(handyman),
            handyman.serviceCategory,
            handyman.category,
            handyman.specialization,
            ...(Array.isArray(handyman.services) ? handyman.services : []),
            ...(Array.isArray(handyman.specialties) ? handyman.specialties : [])
        ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

        if (searchTerm && !searchableText.includes(searchTerm)) {
            return false;
        }

        if (verificationFilter === "verified" && !isHandymanVerified(handyman)) {
            return false;
        }

        if (Number(handyman.rating || 0) < minimumRating) {
            return false;
        }

        if (maximumDistance) {
            if (
                handyman.distanceKm === null ||
                handyman.distanceKm === undefined ||
                Number(handyman.distanceKm) > maximumDistance
            ) {
                return false;
            }
        }

        return true;
    });
}


function updateHandymanComparison() {
    const button =
        document.querySelector("#compareHandymenButton");

    if (!button) {
        return;
    }

    button.textContent = `Compare (${comparedHandymanIds.size})`;
    button.disabled = comparedHandymanIds.size < 2;
}


function renderHandymanComparison() {
    const panel =
        document.querySelector("#handymanComparePanel");
    const grid =
        document.querySelector("#handymanCompareGrid");

    if (!panel || !grid) {
        return;
    }

    const selected =
        handymanList.filter(handyman => comparedHandymanIds.has(handyman.uid));

    grid.innerHTML = selected.map(handyman => `
        <article class="hd-compare-profile">
            <h3>${escapeHTML(getHandymanName(handyman))}</h3>
            <p><strong>Service</strong> ${escapeHTML(getHandymanService(handyman))}</p>
            <p><strong>Verification</strong> ${isHandymanVerified(handyman) ? "Verified" : escapeHTML(handyman.verificationStatus || "Not verified")}</p>
            <p><strong>Rating</strong> ${Number(handyman.rating || 0).toFixed(1)} (${Number(handyman.reviewCount || 0)} reviews)</p>
            <p><strong>Completed jobs</strong> ${Number(handyman.completedJobs || 0)}</p>
            <p><strong>Distance</strong> ${handyman.distanceKm == null ? "Nearby" : `${Number(handyman.distanceKm).toFixed(1)} km`}</p>
            <p><strong>Availability</strong> ${isHandymanAvailableForBooking(handyman, document.querySelector("#bookingDate")?.value || "", document.querySelector("#bookingTime")?.value || "") ? "Accepting bookings" : "Unavailable for selected time"}</p>
        </article>
    `).join("");

    panel.classList.remove("hd-hidden");
}


function renderHandymen() {

    const grid =
        document.querySelector(
            "#handymanGrid"
        ) ||
        document.querySelector(
            ".hd-handyman-grid"
        );

    if (!grid) {
        console.error(
            "Handyman grid not found."
        );
        return;
    }

    const currentIds = new Set(
        handymanList
            .filter(handyman => handyman && handyman.uid)
            .map(handyman => handyman.uid)
    );

    const visibleHandymen = getVisibleHandymen();

    comparedHandymanIds.forEach(handymanId => {
        if (!currentIds.has(handymanId)) {
            comparedHandymanIds.delete(handymanId);
        }
    });

    updateHandymanComparison();

    grid.querySelectorAll("[data-handyman-id]").forEach(card => {
        if (!visibleHandymen.some(handyman => handyman.uid === card.dataset.handymanId)) {
            card.remove();
        }
    });

    if (!visibleHandymen.length) {
        grid.innerHTML = `<div class="hd-empty">No handymen match these filters.</div>`;
        return;
    }

    visibleHandymen.forEach(handyman => {

        if (!handyman || !handyman.uid) {
            return;
        }

        const name = getHandymanName(handyman);
        const service = getHandymanService(handyman);
        const rating = Number(handyman.rating || 0);
        const reviewCount = Number(handyman.reviewCount || 0);
        const completedJobs = Number(handyman.completedJobs || 0);
        const online = isHandymanOnline(handyman);
        const verified = isHandymanVerified(handyman);
        const verificationLabel = verified
            ? "Verified"
            : handyman.verificationStatus === "pending"
                ? "Verification pending"
                : "Not verified";
        const distance =
            handyman.distanceKm !== null &&
            handyman.distanceKm !== undefined
                ? `${handyman.distanceKm.toFixed(1)} km`
                : "Nearby";
        const initials = getInitials(name);

        let card = grid.querySelector(`[data-handyman-id="${CSS.escape(handyman.uid)}"]`);

        if (!card) {
            card = document.createElement("div");
            card.className = "hd-handyman";
            card.dataset.handymanId = handyman.uid;
            grid.appendChild(card);
        }

        card.className = "hd-handyman";
        card.dataset.handymanId = handyman.uid;

        card.innerHTML = `
            <div class="hd-handyman-top">
                <div class="hd-handyman-avatar">
                    ${
                        handyman.photoURL || handyman.profileImage || handyman.photo
                            ? `
                                <img
                                    src="${escapeHTML(
                                        handyman.photoURL ||
                                        handyman.profileImage ||
                                        handyman.photo
                                    )}"
                                    alt="${escapeHTML(name)}"
                                >
                              `
                            : `<span>${escapeHTML(initials)}</span>`
                    }
                    <span class="hd-online-dot ${online ? "online" : ""}"></span>
                </div>

                <div class="hd-handyman-name">
                    <strong>${escapeHTML(name)}</strong>
                    <span>${escapeHTML(service)}</span>
                    <div class="${verified ? "hd-verified" : "hd-verification-status"}">
                        ${verified ? "✓ " : ""}${escapeHTML(verificationLabel)}
                    </div>
                </div>
            </div>

            <div class="hd-handyman-meta">
                <span class="hd-rating">
                    ★ ${rating ? rating.toFixed(1) : "New"}
                    ${reviewCount ? `· ${reviewCount} reviews` : "· No reviews"}
                </span>
                <span>${completedJobs} completed</span>
                <span>${distance}</span>
            </div>

            <label class="hd-compare-select">
                <input
                    type="checkbox"
                    data-compare-handyman="${escapeHTML(handyman.uid)}"
                    ${comparedHandymanIds.has(handyman.uid) ? "checked" : ""}
                >
                Compare
            </label>

            <button
                type="button"
                class="hd-book-handyman hd-select-handyman"
                data-handyman-id="${escapeHTML(handyman.uid)}"
            >
                Book Now
            </button>
        `;

        card.querySelector("[data-compare-handyman]")?.addEventListener(
            "change",
            event => {
                if (event.target.checked) {
                    if (comparedHandymanIds.size >= 3) {
                        event.target.checked = false;
                        alert("Compare up to three handymen at a time.");
                        return;
                    }

                    comparedHandymanIds.add(handyman.uid);
                } else {
                    comparedHandymanIds.delete(handyman.uid);
                }

                updateHandymanComparison();
            }
        );

    });

    setupHandymanCardEvents();

}


// ======================================================
// HANDYMAN CARD EVENTS
// ======================================================

function openBookingModal(serviceName = "", handyman = null) {

    const modal =
        document.querySelector(
            "#bookingModal"
        );

    if (!modal) {
        return;
    }

    populateSavedAddressOptions();

    const serviceSelect =
        document.querySelector(
            "#bookingService"
        );

    if (serviceName && serviceSelect) {

        const options =
            Array.from(
                serviceSelect.options
            );

        const match =
            options.findIndex(
                option =>
                    option.textContent
                        .trim()
                        .toLowerCase() ===
                    serviceName
                        .toLowerCase()
            );

        if (match >= 0) {
            serviceSelect.selectedIndex =
                match;
        }

    }

    const handymanSelect =
        document.querySelector(
            "#bookingHandyman"
        );

    if (handyman && handymanSelect) {
        handymanSelect.value =
            handyman.uid;
    }

    modal.classList.add("active");

}

window.openBookingModal = openBookingModal;
window.submitBookingRequest = submitBookingRequest;


function setupHandymanCardEvents() {

    document
        .querySelectorAll(
            ".hd-select-handyman"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    const handymanId =
                        button.dataset.handymanId;

                    const handyman =
                        handymanList.find(
                            item =>
                                item.uid ===
                                handymanId
                        );

                    if (!handyman) {
                        return;
                    }

                    selectedHandyman =
                        handyman;

                    const serviceName =
                        document.querySelector(
                            "#bookingService"
                        )?.value ||
                        getHandymanService(handyman);

                    const select =
                        document.querySelector(
                            "#bookingHandyman"
                        );

                    if (select) {
                        select.value =
                            handyman.uid;
                    }

                    openBookingModal(
                        serviceName,
                        handyman
                    );

                    const bookingSection =
                        document.querySelector(
                            "#bookingSection"
                        );

                    if (bookingSection) {
                        bookingSection
                            .scrollIntoView({
                                behavior: "smooth",
                                block: "start"
                            });
                    }

                }
            );

        });

}


// ======================================================
// BOOKING HANDYMAN SELECT
// ======================================================

function populateBookingHandymen() {

    const select =
        document.querySelector(
            "#bookingHandyman"
        );

    if (!select) {
        return;
    }

    const currentValue =
        select.value;

    const date =
        document.querySelector("#bookingDate")?.value || "";

    const time =
        document.querySelector("#bookingTime")?.value || "";

    const availableHandymen =
        handymanList.filter(
            handyman =>
                isHandymanAvailableForBooking(handyman, date, time)
        );

    select.innerHTML = `
        <option value="">Select an available handyman</option>
    `;

    availableHandymen.forEach(handyman => {

        const option =
            document.createElement("option");

        option.value =
            handyman.uid;

        option.textContent =
            `${getHandymanName(handyman)} • ${getHandymanService(handyman)}`;

        select.appendChild(option);

    });

    if (!availableHandymen.length) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent =
            date && time
                ? "No handymen available for this time"
                : "Choose a date and time to check availability";
        option.disabled = true;
        select.appendChild(option);
    }

    if (
        currentValue &&
        availableHandymen.some(
            handyman =>
                handyman.uid === currentValue
        )
    ) {
        select.value = currentValue;
    }

}


// ======================================================
// LOCATION
// ======================================================

function setupLocation() {

    if (!navigator.geolocation) {
        return;
    }

    navigator.geolocation.getCurrentPosition(
        position => {

            clientLatitude =
                position.coords.latitude;

            clientLongitude =
                position.coords.longitude;

            handymanList.forEach(
                handyman => {

                    const latitude =
                        Number(
                            handyman.latitude ??
                            handyman.locationCoordinates?.lat ??
                            handyman.location?.latitude
                        );

                    const longitude =
                        Number(
                            handyman.longitude ??
                            handyman.locationCoordinates?.lng ??
                            handyman.location?.longitude
                        );

                    if (
                        Number.isFinite(latitude) &&
                        Number.isFinite(longitude)
                    ) {

                        handyman.distanceKm =
                            calculateDistanceKm(
                                clientLatitude,
                                clientLongitude,
                                latitude,
                                longitude
                            );

                    } else {

                        handyman.distanceKm =
                            null;

                    }

                }
            );

            sortHandymen();

            renderHandymen();

            renderMapMarkers();

        },
        error => {

            console.warn(
                "Client location unavailable:",
                error.message
            );

        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 60000
        }
    );

}


// ======================================================
// MAP MARKERS
// ======================================================

function renderMapMarkers() {

    const map =
        document.querySelector(
            ".hd-map"
        );

    if (!map) {
        return;
    }

    map
        .querySelectorAll(
            ".hd-dynamic-marker"
        )
        .forEach(marker =>
            marker.remove()
        );

    handymanList.forEach(
        (handyman, index) => {

            const marker =
                document.createElement("button");

            marker.type = "button";

            marker.className =
                "hd-map-marker hd-dynamic-marker";

            marker.dataset.handymanId =
                handyman.uid;

            const columns = 4;

            const row =
                Math.floor(index / columns);

            const column =
                index % columns;

            marker.style.left =
                `${18 + column * 21}%`;

            marker.style.top =
                `${25 + row * 22}%`;

            marker.innerHTML = `
                <span>
                    ${escapeHTML(
                        getInitials(
                            getHandymanName(
                                handyman
                            )
                        )
                    )}
                </span>
            `;

            marker.title =
                getHandymanName(handyman);

            marker.addEventListener(
                "click",
                () => {

                    const card =
                        document.querySelector(
                            `[data-handyman-id="${handyman.uid}"]`
                        );

                    if (card) {

                        card.scrollIntoView({
                            behavior: "smooth",
                            block: "center"
                        });

                    }

                }
            );

            map.appendChild(marker);

        }
    );

}


// ======================================================
// BOOKING REALTIME
// ======================================================

function setupBookingRealtime() {

    if (unsubscribeBookings) {
        unsubscribeBookings();
    }

    const bookingQuery = query(
        collection(db, "bookings"),
        where(
            "clientId",
            "==",
            currentUser.uid
        )
    );

    unsubscribeBookings = onSnapshot(
        bookingQuery,
        snapshot => {

            const bookings = [];

            snapshot.forEach(
                bookingDoc => {

                    bookings.push({
                        id: bookingDoc.id,
                        ...bookingDoc.data()
                    });

                }
            );

            bookings.sort(
                (a, b) =>
                    getTimestampMillis(
                        b.createdAt
                    ) -
                    getTimestampMillis(
                        a.createdAt
                    )
            );

            clientBookings = bookings;

            renderAppointments(
                bookings
            );

        },
        error => {

            console.error(
                "Booking realtime error:",
                error
            );

        }
    );

}


function setupReportsRealtime() {
    if (unsubscribeReports) {
        unsubscribeReports();
    }

    const reportsQuery = query(
        collection(db, "reports"),
        where("clientId", "==", currentUser.uid)
    );

    unsubscribeReports = onSnapshot(
        reportsQuery,
        snapshot => {
            clientReports = snapshot.docs.map(reportDoc => ({
                id: reportDoc.id,
                ...reportDoc.data()
            }));

            renderAppointments(clientBookings);
        },
        error => {
            console.error("Client reports realtime error:", error);
        }
    );
}


// ======================================================
// APPOINTMENTS
// ======================================================

function renderAppointments(
    bookings
) {

    const list =
        document.querySelector(
            "#appointmentList"
        );

    if (!list) {
        return;
    }

    list.innerHTML = "";

    if (!bookings.length) {
        return;
    }

    bookings.forEach(booking => {

        const status =
            String(
                booking.status || "pending"
            ).toLowerCase();

        const latestReport = clientReports
            .filter(report => report.bookingId === booking.id)
            .sort((first, second) =>
                getTimestampMillis(second.createdAt) -
                getTimestampMillis(first.createdAt)
            )[0];

        const quote = booking.quote || null;

        const reportStatusLabel = latestReport
            ? ({
                open: "Submitted",
                in_review: "Under review",
                resolved: "Resolved",
                closed: "Closed"
            }[latestReport.status] || "Submitted")
            : "";

        const appointment =
            document.createElement("div");

        appointment.className =
            `hd-appointment ${
                status === "completed"
                    ? "hd-completed-appointment"
                    : ""
            }`;

        appointment.innerHTML = `

            <div class="hd-appointment-info">

                <h3>
                    ${escapeHTML(
                        booking.handymanName ||
                        "Handyman"
                    )}
                </h3>

                <p>
                    ${escapeHTML(
                        booking.service ||
                        booking.serviceName ||
                        "Service"
                    )}
                </p>

                <p>
                    ${escapeHTML(
                        booking.date ||
                        ""
                    )}
                    ${
                        booking.time
                            ? ` • ${escapeHTML(
                                booking.time
                              )}`
                            : ""
                    }
                </p>

                <span class="hd-status ${escapeHTML(status)}">
                    ${escapeHTML(
                        status.charAt(0).toUpperCase() +
                        status.slice(1)
                    )}
                </span>

                ${booking.paymentMethod ? `
                    <p class="hd-payment-status">
                        Payment: ${escapeHTML(
                            booking.paymentStatus === "paid"
                                ? "Confirmed received"
                                : booking.paymentStatus === "client_reported_paid"
                                    ? "Reported paid, awaiting confirmation"
                                    : "Unpaid"
                        )}
                    </p>
                ` : ""}

                ${quote ? `
                    <p class="hd-quote-summary">
                        Estimate: ${escapeHTML(Number(quote.amount || 0).toLocaleString("en-PH", { style: "currency", currency: "PHP" }))}
                        ${quote.status === "accepted" ? "· Accepted" : quote.status === "declined" ? "· Changes requested" : "· Awaiting your response"}
                        ${quote.scope ? `<br>${escapeHTML(quote.scope)}` : ""}
                    </p>
                ` : ""}

                ${latestReport ? `
                    <p class="hd-report-followup">
                        Issue report: ${escapeHTML(reportStatusLabel)}
                        ${latestReport.resolution ? ` · ${escapeHTML(latestReport.resolution)}` : ""}
                    </p>
                ` : ""}

                ${booking.rescheduleRequest?.status === "requested" ? `
                    <p class="hd-change-request-status">Reschedule request awaiting handyman response.</p>
                ` : booking.rescheduleRequest?.status === "approved" ? `
                    <p class="hd-change-request-status">Reschedule approved.</p>
                ` : booking.rescheduleRequest?.status === "rejected" ? `
                    <p class="hd-change-request-status">Reschedule request declined.</p>
                ` : ""}

                ${booking.cancellationRequest?.status === "requested" ? `
                    <p class="hd-change-request-status">Cancellation request awaiting handyman response.</p>
                ` : booking.cancellationRequest?.status === "approved" ? `
                    <p class="hd-change-request-status">Cancellation approved.</p>
                ` : booking.cancellationRequest?.status === "rejected" ? `
                    <p class="hd-change-request-status">Cancellation request declined.</p>
                ` : ""}

                <ol class="hd-status-timeline">
                    ${(
                        Array.isArray(booking.statusHistory) && booking.statusHistory.length
                            ? booking.statusHistory.slice(-5)
                            : [{
                                status,
                                at: booking.updatedAt || booking.createdAt
                            }]
                    ).map(entry => {
                        const entryStatus =
                            typeof entry === "string"
                                ? entry
                                : entry.status || status;
                        const entryTime =
                            typeof entry === "object"
                                ? getTimestampMillis(entry.at)
                                : 0;
                        const formattedTime = entryTime
                            ? new Intl.DateTimeFormat(undefined, {
                                dateStyle: "medium",
                                timeStyle: "short"
                            }).format(new Date(entryTime))
                            : "";

                        return `
                            <li>
                                <strong>${escapeHTML(
                                    entryStatus.replaceAll("_", " ")
                                )}</strong>
                                ${formattedTime ? `<time>${escapeHTML(formattedTime)}</time>` : ""}
                            </li>
                        `;
                    }).join("")}
                </ol>

            </div>

            <div class="hd-appointment-actions">

                ${
                    status === "completed"
                        ? `
                            <button
                                type="button"
                                class="hd-rate-button"
                                data-rate-booking="${escapeHTML(
                                    booking.id
                                )}"
                            >
                                Rate Handyman
                            </button>
                          `
                        : ""
                }

                ${
                    booking.paymentMethod &&
                    ["accepted", "confirmed", "scheduled", "on_the_way", "arrived", "in_progress", "completed"].includes(status) &&
                    !["client_reported_paid", "paid"].includes(booking.paymentStatus)
                        ? `
                            <button
                                type="button"
                                class="hd-payment-button"
                                data-report-payment="${escapeHTML(booking.id)}"
                            >
                                I paid
                            </button>
                          `
                        : ""
                }

                ${
                    quote?.status === "sent"
                        ? `
                            <button
                                type="button"
                                class="hd-change-button"
                                data-quote-response="${escapeHTML(booking.id)}"
                                data-quote-choice="accepted"
                            >
                                Accept estimate
                            </button>
                            <button
                                type="button"
                                class="hd-change-button"
                                data-quote-response="${escapeHTML(booking.id)}"
                                data-quote-choice="changes_requested"
                            >
                                Request changes
                            </button>
                          `
                        : ""
                }

                ${
                    !["declined", "cancelled", "completed"].includes(status) &&
                    booking.rescheduleRequest?.status !== "requested"
                        ? `
                            <button
                                type="button"
                                class="hd-change-button"
                                data-change-booking="${escapeHTML(booking.id)}"
                                data-change-mode="reschedule"
                            >
                                Request reschedule
                            </button>
                          `
                        : ""
                }

                ${
                    !["declined", "cancelled", "completed"].includes(status) &&
                    booking.cancellationRequest?.status !== "requested"
                        ? `
                            <button
                                type="button"
                                class="hd-change-button hd-change-cancel"
                                data-change-booking="${escapeHTML(booking.id)}"
                                data-change-mode="cancel"
                            >
                                Request cancellation
                            </button>
                          `
                        : ""
                }

                ${
                    !["declined", "cancelled"].includes(status)
                        ? `
                            <button
                                type="button"
                                class="hd-report-button"
                                data-report-booking="${escapeHTML(booking.id)}"
                            >
                                Report issue
                            </button>
                          `
                        : ""
                }

            </div>

        `;

        list.appendChild(
            appointment
        );

    });

    document
        .querySelectorAll(
            "[data-rate-booking]"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                async () => {

                    const booking =
                        bookings.find(
                            item =>
                                item.id ===
                                button.dataset.rateBooking
                        );

                    if (booking) {
                        openRatingModal(
                            booking
                        );
                    }

                }
            );

        });

    document
        .querySelectorAll("[data-change-booking]")
        .forEach(button => {
            button.addEventListener("click", () => {
                const booking = bookings.find(
                    item => item.id === button.dataset.changeBooking
                );

                if (booking) {
                    openBookingChangeModal(booking, button.dataset.changeMode);
                }
            });
        });

    document
        .querySelectorAll("[data-report-payment]")
        .forEach(button => {
            button.addEventListener("click", async () => {
                const booking = bookings.find(
                    item => item.id === button.dataset.reportPayment
                );

                if (!booking || button.disabled) {
                    return;
                }

                button.disabled = true;
                button.textContent = "Sending...";

                try {
                    await updateDoc(
                        doc(db, "bookings", booking.id),
                        {
                            paymentStatus: "client_reported_paid",
                            paymentReportedAt: serverTimestamp(),
                            updatedAt: serverTimestamp()
                        }
                    );

                    await createNotification(
                        booking.handymanId,
                        "Payment reported",
                        `${currentProfile?.name || "A client"} reported payment for ${booking.serviceName || booking.service || "a booking"}.`,
                        "payment",
                        booking.id
                    );
                } catch (error) {
                    console.error("Payment report error:", error);
                    alert("Unable to report this payment. Please try again.");
                    button.disabled = false;
                    button.textContent = "I paid";
                }
            });
        });

    document
        .querySelectorAll("[data-quote-response]")
        .forEach(button => {
            button.addEventListener("click", async () => {
                const booking = bookings.find(
                    item => item.id === button.dataset.quoteResponse
                );

                if (!booking?.quote || button.disabled) {
                    return;
                }

                const choice = button.dataset.quoteChoice;
                const clientNote = choice === "changes_requested"
                    ? window.prompt("What should be changed in the estimate?")?.trim() || ""
                    : "";

                if (choice === "changes_requested" && !clientNote) {
                    return;
                }

                try {
                    await updateDoc(
                        doc(db, "bookings", booking.id),
                        {
                            quote: {
                                ...booking.quote,
                                status: choice,
                                clientNote,
                                respondedBy: currentUser.uid,
                                respondedAt: Date.now()
                            },
                            updatedAt: serverTimestamp()
                        }
                    );

                    await createNotification(
                        booking.handymanId,
                        choice === "accepted" ? "Estimate accepted" : "Estimate changes requested",
                        choice === "accepted"
                            ? `${currentProfile?.name || "A client"} accepted your estimate.`
                            : `${currentProfile?.name || "A client"} requested changes to your estimate.`,
                        "quote",
                        booking.id
                    );
                } catch (error) {
                    console.error("QUOTE RESPONSE ERROR:", error);
                    alert("Unable to send your estimate response.");
                }
            });
        });

    document
        .querySelectorAll("[data-report-booking]")
        .forEach(button => {
            button.addEventListener("click", () => {
                selectedReportBooking = bookings.find(
                    item => item.id === button.dataset.reportBooking
                );

                const modal = document.querySelector("#reportBookingModal");
                const summary = document.querySelector("#reportBookingSummary");
                const details = document.querySelector("#reportDetails");
                const category = document.querySelector("#reportCategory");

                if (!selectedReportBooking || !modal) {
                    return;
                }

                if (summary) {
                    summary.textContent = `${selectedReportBooking.serviceName || selectedReportBooking.service || "Booking"} with ${selectedReportBooking.handymanName || "Handyman"}`;
                }

                if (details) {
                    details.value = "";
                }

                if (category) {
                    category.value = "";
                }

                modal.classList.add("active");
                modal.setAttribute("aria-hidden", "false");
            });
        });

}


function openBookingChangeModal(booking, mode) {
    selectedChangeBooking = booking;
    bookingChangeMode = mode;

    const modal = document.querySelector("#bookingChangeModal");
    const title = document.querySelector("#bookingChangeTitle");
    const submit = document.querySelector("#submitBookingChangeButton");
    const dateInput = document.querySelector("#changeBookingDate");
    const timeInput = document.querySelector("#changeBookingTime");
    const scheduleFields = document.querySelector("#changeScheduleFields");
    const reasonInput = document.querySelector("#bookingChangeReason");

    if (!modal) {
        return;
    }

    const isReschedule = mode === "reschedule";

    if (title) title.textContent = isReschedule ? "Request a new time" : "Request cancellation";
    if (submit) submit.textContent = isReschedule ? "Send reschedule request" : "Send cancellation request";
    if (dateInput) dateInput.value = booking.date || "";
    if (timeInput) timeInput.value = booking.time || "";
    if (reasonInput) reasonInput.value = "";
    scheduleFields?.classList.toggle("hd-hidden", !isReschedule);

    modal.classList.add("active");
    modal.setAttribute("aria-hidden", "false");
}


async function submitBookingChangeRequest() {
    if (!selectedChangeBooking || !bookingChangeMode) {
        return;
    }

    const submittedMode = bookingChangeMode;

    const reason =
        document.querySelector("#bookingChangeReason")?.value?.trim() || "";

    if (reason.length < 5) {
        alert("Add a short reason for the requested change.");
        return;
    }

    const changeRequest = {
        status: "requested",
        reason,
        requestedBy: currentUser.uid,
        requestedAt: Date.now()
    };

    let requestField = "";
    let notificationTitle = "";
    let notificationMessage = "";

    if (submittedMode === "reschedule") {
        const date = document.querySelector("#changeBookingDate")?.value || "";
        const time = document.querySelector("#changeBookingTime")?.value || "";

        if (!date || !time) {
            alert("Choose a new date and time.");
            return;
        }

        if (date === selectedChangeBooking.date && time === selectedChangeBooking.time) {
            alert("Choose a different date or time.");
            return;
        }

        requestField = "rescheduleRequest";
        Object.assign(changeRequest, { date, time });
        notificationTitle = "Reschedule requested";
        notificationMessage = `${currentProfile?.name || "A client"} requested a new time for ${selectedChangeBooking.serviceName || "a booking"}.`;
    } else {
        requestField = "cancellationRequest";
        notificationTitle = "Cancellation requested";
        notificationMessage = `${currentProfile?.name || "A client"} requested to cancel ${selectedChangeBooking.serviceName || "a booking"}.`;
    }

    const submitButton = document.querySelector("#submitBookingChangeButton");
    if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "Sending...";
    }

    try {
        await updateDoc(
            doc(db, "bookings", selectedChangeBooking.id),
            {
                [requestField]: changeRequest,
                updatedAt: serverTimestamp()
            }
        );

        await createNotification(
            selectedChangeBooking.handymanId,
            notificationTitle,
            notificationMessage,
            "booking_change",
            selectedChangeBooking.id
        );

        const modal = document.querySelector("#bookingChangeModal");
        modal?.classList.remove("active");
        modal?.setAttribute("aria-hidden", "true");
        selectedChangeBooking = null;
        bookingChangeMode = "";
    } catch (error) {
        console.error("BOOKING CHANGE REQUEST ERROR:", error);
        alert("Unable to send this request. Please try again.");
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = submittedMode === "reschedule"
                ? "Send reschedule request"
                : "Send cancellation request";
        }
    }
}


async function submitBookingReport() {
    if (!selectedReportBooking) {
        return;
    }

    const category =
        document.querySelector("#reportCategory")?.value || "";

    const details =
        document.querySelector("#reportDetails")?.value?.trim() || "";

    if (!category || details.length < 10) {
        alert("Choose a reason and provide at least 10 characters of detail.");
        return;
    }

    const submitButton =
        document.querySelector("#submitBookingReportButton");

    if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "Sending report...";
    }

    try {
        await addDoc(
            collection(db, "reports"),
            {
                bookingId: selectedReportBooking.id,
                clientId: currentUser.uid,
                clientName: currentProfile?.name || currentProfile?.displayName || "Client",
                handymanId: selectedReportBooking.handymanId || "",
                handymanName: selectedReportBooking.handymanName || "Handyman",
                category,
                details,
                status: "open",
                createdAt: serverTimestamp()
            }
        );

        const modal = document.querySelector("#reportBookingModal");
        modal?.classList.remove("active");
        modal?.setAttribute("aria-hidden", "true");
        selectedReportBooking = null;
        alert("Your report was submitted for review.");
    } catch (error) {
        console.error("BOOKING REPORT ERROR:", error);
        alert("Unable to submit the report. Please try again.");
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = "Submit report";
        }
    }
}


// ======================================================
// RATING MODAL
// ======================================================

function openRatingModal(
    booking
) {

    selectedRatingBooking =
        booking;

    selectedRating = 0;

    const modal =
        document.querySelector(
            "#ratingModal"
        );

    if (!modal) {
        return;
    }

    const name =
        document.querySelector(
            "#ratingHandymanName"
        );

    if (name) {

        name.textContent =
            booking.handymanName ||
            "Handyman";

    }

    const ratingValue =
        document.querySelector(
            "#ratingValue"
        );

    if (ratingValue) {
        ratingValue.textContent =
            "0 / 5";
    }

    const comment =
        document.querySelector(
            "#ratingComment"
        );

    if (comment) {
        comment.value = "";
    }

    updateRatingStars();

    modal.classList.add(
        "active"
    );

}


function updateRatingStars() {

    document
        .querySelectorAll(
            ".hd-rating-star"
        )
        .forEach(star => {

            const value =
                Number(
                    star.dataset.rating
                );

            star.classList.toggle(
                "selected",
                value <= selectedRating
            );

        });

    const value =
        document.querySelector(
            "#ratingValue"
        );

    if (value) {

        value.textContent =
            `${selectedRating} / 5`;

    }

}


function setupRatingEvents() {

    document
        .querySelectorAll(
            ".hd-rating-star"
        )
        .forEach(star => {

            star.addEventListener(
                "click",
                () => {

                    selectedRating =
                        Number(
                            star.dataset.rating
                        );

                    updateRatingStars();

                }
            );

        });


    const submit =
        document.querySelector(
            "#submitRatingButton"
        );

    if (submit) {

        submit.addEventListener(
            "click",
            submitRating
        );

    }


    document
        .querySelectorAll(
            "[data-close-rating]"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                closeRatingModal
            );

        });

}


function closeRatingModal() {

    const modal =
        document.querySelector(
            "#ratingModal"
        );

    if (modal) {
        modal.classList.remove(
            "active"
        );
    }

    selectedRatingBooking =
        null;

    selectedRating = 0;

}


async function submitRating() {

    if (!selectedRatingBooking) {
        return;
    }

    if (
        selectedRating < 1 ||
        selectedRating > 5
    ) {
        alert(
            "Please select a rating first."
        );
        return;
    }

    const booking =
        selectedRatingBooking;

    const handymanId =
        booking.handymanId;

    if (!handymanId) {
        alert(
            "Handyman information is missing."
        );
        return;
    }

    const submitButton =
        document.querySelector(
            "#submitRatingButton"
        );

    if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent =
            "Submitting...";
    }

    try {

        const existingReviewQuery =
            query(
                collection(db, "reviews"),
                where(
                    "bookingId",
                    "==",
                    booking.id
                ),
                where(
                    "clientId",
                    "==",
                    currentUser.uid
                )
            );

        const existingReviews =
            await getDocs(
                existingReviewQuery
            );

        if (!existingReviews.empty) {

            alert(
                "You already rated this booking."
            );

            closeRatingModal();

            return;
        }


        const comment =
            document.querySelector(
                "#ratingComment"
            )?.value?.trim() || "";


        await addDoc(
            collection(db, "reviews"),
            {
                bookingId: booking.id,

                clientId:
                    currentUser.uid,

                clientName:
                    currentProfile.name ||
                    currentProfile.displayName ||
                    "Client",

                handymanId,

                handymanName:
                    booking.handymanName ||
                    "Handyman",

                rating:
                    selectedRating,

                comment,

                createdAt:
                    serverTimestamp()
            }
        );


        await createNotification(
            handymanId,
            "New Review",
            `${currentProfile.name || "A client"} rated your service ${selectedRating}/5.`,
            "review",
            booking.id
        );


        closeRatingModal();

        alert(
            "Your rating has been submitted."
        );


    } catch (error) {

        console.error(
            "Rating submission error:",
            error
        );

        alert(
            "Unable to submit your rating. Please try again."
        );

    } finally {

        if (submitButton) {

            submitButton.disabled =
                false;

            submitButton.textContent =
                "Submit Rating";

        }

    }

}


// ======================================================
// NOTIFICATIONS
// ======================================================

function setupNotificationRealtime() {

    if (unsubscribeNotifications) {
        unsubscribeNotifications();
    }

    const notificationQuery =
        query(
            collection(db, "notifications"),
            where(
                "userId",
                "==",
                currentUser.uid
            )
        );

    unsubscribeNotifications =
        onSnapshot(
            notificationQuery,
            snapshot => {

                const notifications =
                    [];

                snapshot.forEach(
                    notificationDoc => {

                        notifications.push({
                            id:
                                notificationDoc.id,
                            ...notificationDoc.data()
                        });

                    }
                );

                notifications.sort(
                    (a, b) =>
                        getTimestampMillis(
                            b.createdAt
                        ) -
                        getTimestampMillis(
                            a.createdAt
                        )
                );

                renderNotifications(
                    notifications
                );

            },
            error => {

                console.error(
                    "Notification error:",
                    error
                );

            }
        );

}


function renderNotifications(
    notifications
) {

    const badge =
        document.querySelector(
            "[data-notification-count]"
        );

    if (!badge) {
        return;
    }

    const unread =
        notifications.filter(
            notification =>
                notification.read !== true
        ).length;

    badge.textContent =
        unread > 99
            ? "99+"
            : String(unread);

    badge.style.display =
        unread
            ? ""
            : "none";

}


// ======================================================
// CREATE NOTIFICATION
// ======================================================

async function createNotification(
    userId,
    title,
    message,
    type = "general",
    relatedId = ""
) {

    try {

        await addDoc(
            collection(db, "notifications"),
            {
                userId,

                title,

                message,

                type,

                relatedId,

                read: false,

                createdBy:
                    currentUser.uid,

                createdAt:
                    serverTimestamp()
            }
        );

    } catch (error) {

        console.error(
            "Notification creation error:",
            error
        );

    }

}


// ======================================================
// BOOKING SUBMIT
// ======================================================

async function submitBookingRequest() {

    if (isBookingSubmitting) {
        return;
    }

    isBookingSubmitting = true;

    const serviceSelect =
        document.querySelector(
            "#bookingService"
        );

    const handymanSelect =
        document.querySelector(
            "#bookingHandyman"
        );

    const paymentMethodSelect =
        document.querySelector(
            "#bookingPaymentMethod"
        );

    const gcashNumberInput =
        document.querySelector(
            "#bookingGcashNumber"
        );

    const bankNameInput =
        document.querySelector(
            "#bookingBankName"
        );

    const transferReferenceInput =
        document.querySelector(
            "#bookingTransferReference"
        );

    const photoInput =
        document.querySelector(
            "#bookingPhotoInput"
        );

    const attachPhotoButton =
        document.querySelector(
            "#attachPhotoButton"
        );

    const dateInput =
        document.querySelector(
            "#bookingDate"
        );

    const timeInput =
        document.querySelector(
            "#bookingTime"
        );

    const addressInput =
        document.querySelector(
            "#bookingAddress"
        );

    const notesInput =
        document.querySelector(
            "#bookingNotes"
        );

    const service =
        serviceSelect?.value?.trim() || "";

    const handymanId =
        handymanSelect?.value?.trim() || "";

    const paymentMethod =
        paymentMethodSelect?.value?.trim() || "";

    const gcashNumber =
        gcashNumberInput?.value?.trim() || "";

    const bankName =
        bankNameInput?.value?.trim() || "";

    const transferReference =
        transferReferenceInput?.value?.trim() || "";

    const photo =
        photoInput?.files?.[0] || null;

    const date =
        dateInput?.value?.trim() || "";

    const time =
        timeInput?.value?.trim() || "";

    const address =
        addressInput?.value?.trim() || "";

    const notes =
        notesInput?.value?.trim() || "";

    if (!service) {
        alert("Please select a service first.");
        return;
    }

    if (!handymanId) {
        alert("Please pick a handyman before requesting the booking.");
        return;
    }

    if (!paymentMethod) {
        isBookingSubmitting = false;
        alert("Please select a payment method.");
        return;
    }

    if (paymentMethod === "GCash" && !gcashNumber) {
        isBookingSubmitting = false;
        alert("Please enter your GCash number.");
        return;
    }

    if (paymentMethod === "GCash" && !/^(09\d{9}|\+639\d{9})$/.test(gcashNumber.replace(/[\s-]/g, ""))) {
        isBookingSubmitting = false;
        alert("Enter a valid Philippine GCash number.");
        return;
    }

    if (paymentMethod === "Bank transfer" && !bankName) {
        isBookingSubmitting = false;
        alert("Please enter the bank name.");
        return;
    }

    if (photo && (!photo.type.startsWith("image/") || photo.size > 5 * 1024 * 1024)) {
        isBookingSubmitting = false;
        alert("Choose an image that is 5 MB or smaller.");
        return;
    }

    const selectedHandyman =
        handymanList.find(
            item => item.uid === handymanId
        );

    if (!selectedHandyman) {
        alert("Selected handyman was not found.");
        return;
    }

    if (
        !isHandymanAvailableForBooking(
            selectedHandyman,
            date,
            time
        )
    ) {
        isBookingSubmitting = false;
        alert("This handyman is not available for the selected date and time.");
        populateBookingHandymen();
        return;
    }

    const submitButton =
        document.querySelector(
            "#confirmBookingButton"
        );

    if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = photo
            ? "Uploading photo and sending..."
            : "Sending request...";
    }

    try {

        let photoURL = "";

        if (photo) {
            const safeFileName = photo.name.replace(/[^a-zA-Z0-9._-]/g, "_");
            const photoRef = ref(
                storage,
                `booking-photos/${currentUser.uid}/${Date.now()}-${safeFileName}`
            );
            const uploadedPhoto = await uploadBytes(
                photoRef,
                photo,
                { contentType: photo.type }
            );
            photoURL = await getDownloadURL(uploadedPhoto.ref);
        }

        const bookingsCollection =
            collection(db, "bookings");

        const baseBookingData = {
            clientId: currentUser.uid,
            clientName:
                currentProfile?.name ||
                currentProfile?.displayName ||
                "Client",
            clientEmail:
                currentProfile?.email ||
                currentUser.email || "",
            clientPhone:
                currentProfile?.phone ||
                currentProfile?.mobile || "",
            handymanId: selectedHandyman.uid,
            handymanName:
                getHandymanName(selectedHandyman),
            serviceName: service,
            service: service,
            paymentMethod,
            paymentDetails: paymentMethod === "GCash"
                ? { gcashNumber: gcashNumber.replace(/[\s-]/g, "") }
                : paymentMethod === "Bank transfer"
                    ? { bankName, transferReference }
                    : {},
            paymentStatus: "unpaid",
            photoURL,
            date,
            time,
            address,
            notes,
            status: "pending",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        };

        const extendedBookingData = {
            ...baseBookingData,
            paymentMethod,
            paymentDetails: paymentMethod === "GCash"
                ? { gcashNumber: gcashNumber.replace(/[\s-]/g, "") }
                : paymentMethod === "Bank transfer"
                    ? { bankName, transferReference }
                    : {},
            photoURL
        };

        let bookingRef;
        let trackingFieldsSaved = true;
        let bookingDetailsSaved = true;

        try {
            bookingRef = await addDoc(
                bookingsCollection,
                {
                    ...extendedBookingData,
                    paymentStatus: "unpaid",
                    statusHistory: [{
                        status: "pending",
                        actorId: currentUser.uid,
                        actorRole: "client",
                        at: Date.now()
                    }]
                }
            );
        } catch (bookingError) {
            if (bookingError.code !== "permission-denied") {
                throw bookingError;
            }

            trackingFieldsSaved = false;

            try {
                bookingRef = await addDoc(
                    bookingsCollection,
                    extendedBookingData
                );
            } catch (extendedBookingError) {
                if (extendedBookingError.code !== "permission-denied") {
                    throw extendedBookingError;
                }

                bookingDetailsSaved = false;
                bookingRef = await addDoc(
                    bookingsCollection,
                    baseBookingData
                );
            }
        }

        await createNotification(
            selectedHandyman.uid,
            "New booking request",
            `${currentProfile?.name || "A client"} requested ${service} for ${date || "a selected date"}.`,
            "booking",
            bookingRef.id
        );

        const bookingModal =
            document.querySelector(
                "#bookingModal"
            );

        if (bookingModal) {
            bookingModal.classList.remove("active");
        }

        showBookingSuccessToast();

        if (!trackingFieldsSaved || !bookingDetailsSaved) {
            alert(
                bookingDetailsSaved
                    ? "Your booking was sent, but Firebase rules rejected payment tracking fields. Update the Firestore booking rules to enable payment tracking and the full status timeline."
                    : "Your booking was sent, but Firebase rules rejected payment and photo details. Update the Firestore booking rules to enable those details."
            );
        }

        if (dateInput) dateInput.value = "";
        if (timeInput) timeInput.value = "";
        if (paymentMethodSelect) paymentMethodSelect.value = "";
        if (gcashNumberInput) gcashNumberInput.value = "";
        if (bankNameInput) bankNameInput.value = "";
        if (transferReferenceInput) transferReferenceInput.value = "";
        if (photoInput) photoInput.value = "";
        if (attachPhotoButton) attachPhotoButton.textContent = "Attach photo";
        document.querySelector("#gcashPaymentDetails")?.classList.add("hd-hidden");
        document.querySelector("#bankTransferDetails")?.classList.add("hd-hidden");
        if (addressInput) addressInput.value = "";
        if (notesInput) notesInput.value = "";

    } catch (error) {

        console.error(
            "Booking submission error:",
            error
        );

        alert(
            "Unable to send the booking request. Please try again."
        );

    } finally {

        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = "Request booking";
        }

        isBookingSubmitting = false;

    }

}


// ======================================================
// DASHBOARD EVENTS
// ======================================================

function setupDashboardEvents() {

    const serviceSelect =
        document.querySelector(
            "#bookingService"
        );

    [
        "#handymanSearchFilter",
        "#handymanVerificationFilter",
        "#handymanRatingFilter",
        "#handymanDistanceFilter"
    ].forEach(selector => {
        const control = document.querySelector(selector);
        control?.addEventListener(
            selector === "#handymanSearchFilter" ? "input" : "change",
            renderHandymen
        );
    });

    document
        .querySelector("#compareHandymenButton")
        ?.addEventListener("click", renderHandymanComparison);

    document
        .querySelector("#closeCompareButton")
        ?.addEventListener("click", () => {
            document.querySelector("#handymanComparePanel")?.classList.add("hd-hidden");
        });

    const attachPhotoButton = document.querySelector("#attachPhotoButton");
    const photoInput = document.querySelector("#bookingPhotoInput");
    const savedAddressSelect = document.querySelector("#bookingSavedAddress");
    const saveAddressButton = document.querySelector("#saveBookingAddressButton");
    const paymentMethodSelect = document.querySelector("#bookingPaymentMethod");
    const gcashPaymentDetails = document.querySelector("#gcashPaymentDetails");
    const bankTransferDetails = document.querySelector("#bankTransferDetails");

    if (paymentMethodSelect) {
        paymentMethodSelect.addEventListener("change", () => {
            const method = paymentMethodSelect.value;
            gcashPaymentDetails?.classList.toggle("hd-hidden", method !== "GCash");
            bankTransferDetails?.classList.toggle("hd-hidden", method !== "Bank transfer");
        });
    }

    if (attachPhotoButton && photoInput) {
        attachPhotoButton.addEventListener("click", () => {
            photoInput.click();
        });

        photoInput.addEventListener("change", () => {
            const file = photoInput.files && photoInput.files[0];

            if (file) {
                const fileLabel = file.name.length > 28
                    ? `${file.name.slice(0, 25)}...`
                    : file.name;

                attachPhotoButton.textContent = fileLabel;
            }
        });
    }

    savedAddressSelect?.addEventListener("change", () => {
        const addressInput = document.querySelector("#bookingAddress");
        if (addressInput && savedAddressSelect.value) {
            addressInput.value = savedAddressSelect.value;
        }
    });

    saveAddressButton?.addEventListener("click", async () => {
        const addressInput = document.querySelector("#bookingAddress");
        const address = addressInput?.value?.trim() || "";

        if (address.length < 5) {
            alert("Enter an address before saving it.");
            return;
        }

        const existingAddresses = Array.isArray(currentProfile?.savedAddresses)
            ? currentProfile.savedAddresses
            : [];

        if (existingAddresses.includes(address)) {
            populateSavedAddressOptions();
            if (savedAddressSelect) savedAddressSelect.value = address;
            return;
        }

        saveAddressButton.disabled = true;

        try {
            await updateDoc(
                doc(db, "users", currentUser.uid),
                {
                    savedAddresses: arrayUnion(address),
                    updatedAt: serverTimestamp()
                }
            );

            currentProfile = {
                ...currentProfile,
                savedAddresses: [...existingAddresses, address]
            };

            populateSavedAddressOptions();
            if (savedAddressSelect) savedAddressSelect.value = address;
        } catch (error) {
            console.error("SAVE ADDRESS ERROR:", error);
            alert("Unable to save this address. Please try again.");
        } finally {
            saveAddressButton.disabled = false;
        }
    });

    if (serviceSelect) {

        serviceSelect.addEventListener(
            "change",
            () => {

                sortHandymen();

                renderHandymen();

                populateBookingHandymen();

            }
        );

    }

    document
        .querySelectorAll(
            ".hd-quick-service"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    const serviceName =
                        button.dataset.service ||
                        button.textContent.trim();

                    if (serviceSelect) {

                        const options =
                            Array.from(
                                serviceSelect.options
                            );

                        const selectedIndex =
                            options.findIndex(
                                option =>
                                    option.textContent
                                        .trim()
                                        .toLowerCase() ===
                                    serviceName
                                        .toLowerCase()
                            );

                        if (selectedIndex >= 0) {
                            serviceSelect.selectedIndex =
                                selectedIndex;
                        }

                    }

                    document
                        .querySelectorAll(
                            ".hd-quick-service"
                        )
                        .forEach(item => {
                            item.classList.toggle(
                                "active",
                                item === button
                            );
                        });

                    sortHandymen();
                    renderHandymen();
                }
            );

        });

    document
        .querySelectorAll(
            ".hd-service-card"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    const serviceName =
                        button.dataset.serviceCard ||
                        button.textContent.trim();

                    if (serviceSelect) {

                        const options =
                            Array.from(
                                serviceSelect.options
                            );

                        const selectedIndex =
                            options.findIndex(
                                option =>
                                    option.textContent
                                        .trim()
                                        .toLowerCase() ===
                                    serviceName
                                        .toLowerCase()
                            );

                        if (selectedIndex >= 0) {
                            serviceSelect.selectedIndex =
                                selectedIndex;
                        }

                    }

                    sortHandymen();
                    renderHandymen();

                    const handymanGrid =
                        document.querySelector(
                            "#handymanGrid"
                        );

                    if (handymanGrid) {
                        handymanGrid.scrollIntoView({
                            behavior: "smooth",
                            block: "start"
                        });
                    }

                }
            );

        });

    const findHandymanButton =
        document.querySelector(
            "#findHandymanButton"
        );

    if (findHandymanButton) {

        findHandymanButton.addEventListener(
            "click",
            () => {

                const serviceValue =
                    serviceSelect?.value?.trim() || "";

                if (!serviceValue) {
                    alert(
                        "Choose a service first."
                    );
                    return;
                }

                sortHandymen();
                renderHandymen();

                const handymanGrid =
                    document.querySelector(
                        "#handymanGrid"
                    );

                if (handymanGrid) {
                    handymanGrid.scrollIntoView({
                        behavior: "smooth",
                        block: "start"
                    });
                }

            }
        );

    }

    const confirmBookingButton =
        document.querySelector(
            "#confirmBookingButton"
        );

    if (confirmBookingButton) {
        confirmBookingButton.addEventListener(
            "click",
            submitBookingRequest
        );
    }

    document
        .querySelector("#submitBookingReportButton")
        ?.addEventListener("click", submitBookingReport);

    document
        .querySelector("#submitBookingChangeButton")
        ?.addEventListener("click", submitBookingChangeRequest);

    ["#bookingDate", "#bookingTime"].forEach(selector => {
        document.querySelector(selector)?.addEventListener(
            "change",
            populateBookingHandymen
        );
    });


    document
        .querySelectorAll(
            "[data-close-modal]"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    const modal =
                        button.closest(
                            ".hd-modal"
                        );

                    if (modal) {
                        modal.classList.remove(
                            "active"
                        );
                    }

                }
            );

        });

}


// ======================================================
// LOGOUT
// ======================================================

function setupLogout() {

    document
        .querySelectorAll(
            "[data-logout]"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                async () => {

                    try {

                        await signOut(
                            auth
                        );

                        window.location.href =
                            "../login.html";

                    } catch (error) {

                        console.error(
                            "Logout error:",
                            error
                        );

                    }

                }
            );

        });

}


// ======================================================
// CLEANUP
// ======================================================

window.addEventListener(
    "beforeunload",
    () => {

        if (unsubscribeHandymen) {
            unsubscribeHandymen();
        }

        if (unsubscribeBookings) {
            unsubscribeBookings();
        }

        if (unsubscribeReviews) {
            unsubscribeReviews();
        }

        if (unsubscribeNotifications) {
            unsubscribeNotifications();
        }

        if (unsubscribeConversations) {
            unsubscribeConversations();
        }

    }
);