import {
    auth,
    db
} from "../firebase-config.js";

import {
    onAuthStateChanged,
    signOut,
    updateProfile
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    where,
    updateDoc,
    orderBy
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";


/* =========================================================
   ELEMENTS
========================================================= */

const accountAvatar =
    document.getElementById("accountAvatar");

const accountName =
    document.getElementById("accountName");

const accountService =
    document.getElementById("accountService");

const availabilityText =
    document.getElementById("availabilityText");

const completedCount =
    document.getElementById("completedCount");

const ratingCount =
    document.getElementById("ratingCount");

const reviewCount =
    document.getElementById("reviewCount");

const accountNameInput =
    document.getElementById("accountNameInput");

const accountEmailInput =
    document.getElementById("accountEmailInput");

const accountPhoneInput =
    document.getElementById("accountPhoneInput");

const accountCategoryInput =
    document.getElementById("accountCategoryInput");

const accountServiceInput =
    document.getElementById("accountServiceInput");

const accountSpecialtiesInput =
    document.getElementById("accountSpecialtiesInput");

const verificationStatusLabel =
    document.getElementById("verificationStatusLabel");

const verificationChecklist =
    document.getElementById("verificationChecklist");

const accountExperienceInput =
    document.getElementById("accountExperienceInput");

const accountBioInput =
    document.getElementById("accountBioInput");

const handymanAvailableInput =
    document.getElementById("handymanAvailableInput");

const availabilityScheduleEnabled =
    document.getElementById("availabilityScheduleEnabled");

const availabilityScheduleFields =
    document.getElementById("availabilityScheduleFields");

const availabilityStartInput =
    document.getElementById("availabilityStart");

const availabilityEndInput =
    document.getElementById("availabilityEnd");

const availabilityDateOffInput =
    document.getElementById("availabilityDateOffInput");

const addUnavailableDateButton =
    document.getElementById("addUnavailableDateButton");

const unavailableDatesList =
    document.getElementById("unavailableDatesList");

const saveProfileButton =
    document.getElementById("saveProfileButton");

const accountMessage =
    document.getElementById("accountMessage");

const bookingList =
    document.getElementById("bookingList");

const bookingCountText =
    document.getElementById("bookingCountText");

const logoutButton =
    document.getElementById("logoutButton");

const openMessagesButton =
    document.getElementById("openMessagesButton");

const openJobsButton =
    document.getElementById("openJobsButton");


let currentUser = null;
let currentUserData = null;
let unavailableDates = [];


/* =========================================================
   MESSAGE
========================================================= */

function showMessage(
    text,
    type = "error"
) {

    if (!accountMessage) {
        return;
    }

    accountMessage.textContent =
        text;

    accountMessage.className =
        "ha-message show " + type;

}


/* =========================================================
   ESCAPE HTML
========================================================= */

function escapeHTML(value) {

    return String(
        value ?? ""
    )
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

}


/* =========================================================
   INITIALIZE PROFILE
========================================================= */

function renderProfile(
    data
) {

    const name =
        data.name ||
        currentUser.displayName ||
        "Handyman";

    const service =
        data.serviceName ||
        data.serviceCategory ||
        "Handyman service";

    const firstLetter =
        name
            .trim()
            .charAt(0)
            .toUpperCase() ||
        "H";


    accountName.textContent =
        name;

    accountService.textContent =
        service;

    accountAvatar.textContent =
        firstLetter;


    accountNameInput.value =
        name;

    accountEmailInput.value =
        data.email ||
        currentUser.email ||
        "";

    accountPhoneInput.value =
        data.phone ||
        "";

    accountCategoryInput.value =
        data.serviceCategory ||
        "General Handyman";

    accountServiceInput.value =
        data.serviceName ||
        "";

    accountSpecialtiesInput.value =
        Array.isArray(data.specialties)
            ? data.specialties.join(", ")
            : Array.isArray(data.services)
                ? data.services.join(", ")
                : "";

    accountExperienceInput.value =
        data.experience ||
        "";

    accountBioInput.value =
        data.bio ||
        "";

    const verificationStatus =
        data.verified === true || data.verificationStatus === "verified"
            ? "Verified"
            : data.verificationStatus === "pending"
                ? "Under review"
                : "Not verified";

    verificationStatusLabel.textContent = verificationStatus;

    const checklistItems = [
        ["Name and contact details", Boolean(data.name && data.phone)],
        ["Service and specialties", Boolean(data.serviceName && (data.specialties?.length || data.services?.length || data.serviceCategory))],
        ["Experience and description", Boolean(data.experience && data.bio)],
        ["Profile photo", Boolean(data.profilePhoto || data.photoURL || data.profileImage)]
    ];

    verificationChecklist.innerHTML = checklistItems
        .map(([label, complete]) => `
            <li class="${complete ? "complete" : "incomplete"}">
                ${complete ? "Complete" : "Needed"}: ${escapeHTML(label)}
            </li>
        `)
        .join("");

    handymanAvailableInput.checked =
        data.isAvailable !== false &&
        data.availability !== false;

    const schedule =
        data.availabilitySchedule || {};

    unavailableDates = Array.isArray(schedule.unavailableDates)
        ? [...schedule.unavailableDates]
        : [];

    renderUnavailableDates();

    availabilityScheduleEnabled.checked =
        schedule.enabled === true;

    availabilityScheduleFields.hidden =
        !availabilityScheduleEnabled.checked;

    availabilityStartInput.value =
        schedule.start || "";

    availabilityEndInput.value =
        schedule.end || "";

    document
        .querySelectorAll('input[name="availabilityDay"]')
        .forEach(input => {
            input.checked =
                Array.isArray(schedule.days) &&
                schedule.days.includes(Number(input.value));
        });


    const isAvailable =
        handymanAvailableInput.checked;

    availabilityText.textContent =
        isAvailable
            ? "Available"
            : "Currently unavailable";

}


function renderUnavailableDates() {
    if (!unavailableDatesList) {
        return;
    }

    unavailableDatesList.innerHTML = unavailableDates
        .map(date => `
            <span class="ha-unavailable-date">
                ${escapeHTML(date)}
                <button type="button" data-remove-unavailable-date="${escapeHTML(date)}" aria-label="Remove ${escapeHTML(date)}">×</button>
            </span>
        `)
        .join("");
}


/* =========================================================
   LOAD BOOKINGS
========================================================= */

async function loadBookings(
    handymanId
) {

    if (!bookingList) {
        return;
    }

    bookingList.innerHTML = `
        <div class="ha-loading">
            Loading bookings...
        </div>
    `;


    try {

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


        const snapshot =
            await getDocs(
                bookingsQuery
            );


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

                const second =
                    b.createdAt?.seconds ||
                    0;

                return second - first;

            }
        );


        const completed =
            bookings.filter(
                booking =>
                    booking.status ===
                    "completed"
            ).length;


        completedCount.textContent =
            completed;


        bookingCountText.textContent =
            `${bookings.length} booking${bookings.length === 1 ? "" : "s"}`;


        if (!bookings.length) {

            bookingList.innerHTML = `
                <div class="ha-empty">
                    No client bookings yet.
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
                            "Service";

                        const date =
                            booking.date ||
                            "No date";

                        const time =
                            booking.time ||
                            "No time";

                        const status =
                            booking.status ||
                            "pending";


                        return `
                            <article class="ha-booking">

                                <div class="ha-booking-info">

                                    <strong>
                                        ${escapeHTML(clientName)}
                                    </strong>

                                    <span>
                                        ${escapeHTML(service)}
                                        ·
                                        ${escapeHTML(date)}
                                        ·
                                        ${escapeHTML(time)}
                                    </span>

                                </div>

                                <span class="ha-booking-status">
                                    ${escapeHTML(status)}
                                </span>

                            </article>
                        `;

                    }
                )
                .join("");


    } catch (error) {

        console.error(
            "HANDY ACCOUNT BOOKINGS ERROR:",
            error
        );


        bookingList.innerHTML = `
            <div class="ha-empty">
                Unable to load your client bookings.
            </div>
        `;

    }

}


/* =========================================================
   LOAD REVIEWS
========================================================= */

async function loadReviews(
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


        const reviews =
            snapshot.docs.map(
                item =>
                    item.data()
            );


        reviewCount.textContent =
            reviews.length;


        if (!reviews.length) {

            ratingCount.textContent =
                "0.0";

            return;
        }


        const total =
            reviews.reduce(
                (
                    sum,
                    review
                ) => {

                    return (
                        sum +
                        Number(
                            review.rating ||
                            0
                        )
                    );

                },
                0
            );


        const average =
            total /
            reviews.length;


        ratingCount.textContent =
            average.toFixed(1);


    } catch (error) {

        console.error(
            "HANDY ACCOUNT REVIEWS ERROR:",
            error
        );

        ratingCount.textContent =
            "0.0";

        reviewCount.textContent =
            "0";

    }

}


/* =========================================================
   SAVE PROFILE
========================================================= */

async function saveProfile() {

    if (!currentUser) {
        return;
    }


    const name =
        accountNameInput.value.trim();

    const phone =
        accountPhoneInput.value.trim();

    const serviceCategory =
        accountCategoryInput.value;

    const serviceName =
        accountServiceInput.value.trim();

    const specialties =
        [...new Set(
            accountSpecialtiesInput.value
                .split(/[,;\n]/)
                .map(service => service.trim())
                .filter(Boolean)
        )].slice(0, 12);

    const experience =
        accountExperienceInput.value.trim();

    const bio =
        accountBioInput.value.trim();

    const isAvailable =
        handymanAvailableInput.checked;

    const scheduleEnabled =
        availabilityScheduleEnabled.checked;

    const availabilityDays =
        Array.from(
            document.querySelectorAll('input[name="availabilityDay"]:checked')
        ).map(input => Number(input.value));

    const availabilityStart =
        availabilityStartInput.value;

    const availabilityEnd =
        availabilityEndInput.value;


    if (!name) {

        showMessage(
            "Please enter your full name."
        );

        accountNameInput.focus();

        return;
    }


    if (!phone) {

        showMessage(
            "Please enter your mobile number."
        );

        accountPhoneInput.focus();

        return;
    }


    if (!serviceName) {

        showMessage(
            "Please enter your service name."
        );

        accountServiceInput.focus();

        return;
    }

    if (scheduleEnabled && availabilityDays.length === 0) {
        showMessage("Select at least one working day.");
        return;
    }

    if (
        scheduleEnabled &&
        (!availabilityStart || !availabilityEnd || availabilityStart >= availabilityEnd)
    ) {
        showMessage("Choose valid start and end times for your schedule.");
        return;
    }


    saveProfileButton.disabled =
        true;

    saveProfileButton.textContent =
        "Saving...";


    try {

        const userRef =
            doc(
                db,
                "users",
                currentUser.uid
            );


        await updateDoc(
            userRef,
            {
                name: name,
                phone: phone,
                serviceCategory:
                    serviceCategory,
                serviceName:
                    serviceName,
                specialties,
                services: specialties,
                experience:
                    experience,
                bio:
                    bio
            }
        );

        let availabilitySaved = true;

        try {
            await updateDoc(
                userRef,
                {
                    isAvailable,
                    availability: isAvailable,
                    availabilitySchedule: {
                        enabled: scheduleEnabled,
                        days: scheduleEnabled ? availabilityDays : [],
                        start: scheduleEnabled ? availabilityStart : "",
                        end: scheduleEnabled ? availabilityEnd : "",
                        unavailableDates
                    }
                }
            );
        } catch (availabilityError) {
            availabilitySaved = false;
            console.error("HANDY AVAILABILITY SAVE ERROR:", availabilityError);
        }


        await updateProfile(
            currentUser,
            {
                displayName:
                    name
            }
        );


        currentUserData = {
            ...currentUserData,
            name,
            phone,
            serviceCategory,
            serviceName,
            specialties,
            services: specialties,
            experience,
            bio
        };

        if (availabilitySaved) {
            currentUserData = {
                ...currentUserData,
                isAvailable,
                availability: isAvailable,
                availabilitySchedule: {
                    enabled: scheduleEnabled,
                    days: scheduleEnabled ? availabilityDays : [],
                    start: scheduleEnabled ? availabilityStart : "",
                    end: scheduleEnabled ? availabilityEnd : "",
                    unavailableDates
                }
            };
        }


        renderProfile(
            currentUserData
        );


        showMessage(
            availabilitySaved
                ? "Profile updated successfully."
                : "Profile saved, but availability settings were not accepted by Firebase rules.",
            availabilitySaved ? "success" : "error"
        );


    } catch (error) {

        console.error(
            "HANDY ACCOUNT SAVE ERROR:",
            error
        );


        if (
            error.code ===
            "permission-denied"
        ) {

            showMessage(
                "Firebase blocked the profile update. Check your Firestore rules."
            );

        } else {

            showMessage(
                error.message ||
                "Unable to save your profile."
            );

        }

    } finally {

        saveProfileButton.disabled =
            false;

        saveProfileButton.textContent =
            "Save changes";

    }

}


/* =========================================================
   LOGOUT
========================================================= */

async function logout() {

    try {

        await signOut(
            auth
        );

        window.location.href =
            "../login.html";

    } catch (error) {

        console.error(
            "HANDY LOGOUT ERROR:",
            error
        );

    }

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


        currentUser =
            user;


        try {

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

                await signOut(
                    auth
                );

                window.location.href =
                    "../login.html";

                return;
            }


            currentUserData =
                snapshot.data();


            if (
                currentUserData.role !==
                "handyman"
            ) {

                await signOut(
                    auth
                );

                window.location.href =
                    "../login.html";

                return;
            }


            renderProfile(
                currentUserData
            );


            await Promise.all([
                loadBookings(user.uid),
                loadReviews(user.uid)
            ]);


        } catch (error) {

            console.error(
                "HANDY ACCOUNT LOAD ERROR:",
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

saveProfileButton?.addEventListener(
    "click",
    saveProfile
);

availabilityScheduleEnabled?.addEventListener(
    "change",
    () => {
        availabilityScheduleFields.hidden =
            !availabilityScheduleEnabled.checked;
    }
);


logoutButton?.addEventListener(
    "click",
    logout
);


openJobsButton?.addEventListener(
    "click",
    () => {

        document
            .getElementById("bookingsSection")
            ?.scrollIntoView({
                behavior: "smooth"
            });

    }
);


openMessagesButton?.addEventListener(
    "click",
    () => {

        window.location.href =
            "./handyman-chat.html";

    }
);

addUnavailableDateButton?.addEventListener("click", () => {
    const date = availabilityDateOffInput?.value || "";

    if (!date || unavailableDates.includes(date)) {
        return;
    }

    unavailableDates.push(date);
    unavailableDates.sort();
    availabilityDateOffInput.value = "";
    renderUnavailableDates();
});

unavailableDatesList?.addEventListener("click", event => {
    const removeButton = event.target.closest("[data-remove-unavailable-date]");

    if (!removeButton) {
        return;
    }

    unavailableDates = unavailableDates.filter(
        date => date !== removeButton.dataset.removeUnavailableDate
    );
    renderUnavailableDates();
});