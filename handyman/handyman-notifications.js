import { auth, db } from "../firebase-config.js";

import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

import {
    collection,
    query,
    where,
    orderBy,
    onSnapshot,
    doc,
    updateDoc,
    deleteDoc,
    writeBatch
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";


/* =========================================================
   ELEMENTS
   ========================================================= */

const notificationsList =
    document.getElementById("notificationsList");

const emptyNotifications =
    document.getElementById("emptyNotifications");

const notificationCount =
    document.getElementById("notificationCount");

const markAllButton =
    document.getElementById("markAllButton");

const notificationsMessage =
    document.getElementById("notificationsMessage");

const backButton =
    document.getElementById("backButton");

const dashboardLink =
    document.getElementById("dashboardLink");


/* =========================================================
   STATE
   ========================================================= */

let currentUser = null;
let unsubscribeNotifications = null;
let notifications = [];


/* =========================================================
   HELPERS
   ========================================================= */

function showMessage(text, type = "error") {
    if (!notificationsMessage) return;

    notificationsMessage.textContent = text;

    notificationsMessage.className =
        "notifications-message show " + type;

    setTimeout(() => {
        notificationsMessage.classList.remove("show");
    }, 3500);
}


function getNotificationType(notification) {
    return String(
        notification.type ||
        notification.notificationType ||
        "general"
    ).toLowerCase();
}


function getNotificationIcon(type) {

    if (
        type.includes("booking") ||
        type.includes("request")
    ) {
        return `
            <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
            >
                <rect x="3" y="4" width="18" height="17" rx="2"></rect>
                <path d="M16 2v4"></path>
                <path d="M8 2v4"></path>
                <path d="M3 10h18"></path>
            </svg>
        `;
    }

    if (
        type.includes("message") ||
        type.includes("chat")
    ) {
        return `
            <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
            >
                <path d="M21 11.5a8.38 8.38 0 0 1-9 8.3 8.5 8.5 0 0 1-4-.9L3 20l1.2-4.4A8.4 8.4 0 1 1 21 11.5Z"></path>
            </svg>
        `;
    }

    if (
        type.includes("complete") ||
        type.includes("success")
    ) {
        return `
            <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
            >
                <circle cx="12" cy="12" r="9"></circle>
                <path d="m8 12 2.5 2.5L16 9"></path>
            </svg>
        `;
    }

    if (
        type.includes("cancel") ||
        type.includes("decline")
    ) {
        return `
            <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
            >
                <circle cx="12" cy="12" r="9"></circle>
                <path d="m9 9 6 6"></path>
                <path d="m15 9-6 6"></path>
            </svg>
        `;
    }

    return `
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
        >
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"></path>
            <path d="M10 21h4"></path>
        </svg>
    `;
}


function formatTimestamp(value) {
    if (!value) {
        return "Just now";
    }

    try {
        const date =
            value.toDate
                ? value.toDate()
                : new Date(value);

        if (Number.isNaN(date.getTime())) {
            return "Recently";
        }

        const now = new Date();

        const difference =
            now.getTime() -
            date.getTime();

        const seconds =
            Math.floor(
                difference / 1000
            );

        if (seconds < 60) {
            return "Just now";
        }

        const minutes =
            Math.floor(seconds / 60);

        if (minutes < 60) {
            return `${minutes}m ago`;
        }

        const hours =
            Math.floor(minutes / 60);

        if (hours < 24) {
            return `${hours}h ago`;
        }

        const days =
            Math.floor(hours / 24);

        if (days < 7) {
            return `${days}d ago`;
        }

        return date.toLocaleDateString(
            "en-US",
            {
                month: "short",
                day: "numeric",
                year: "numeric"
            }
        );

    } catch {
        return "Recently";
    }
}


function getTimestampValue(notification) {
    const value =
        notification.createdAt ||
        notification.timestamp ||
        notification.updatedAt;

    if (!value) return 0;

    try {
        if (value.toDate) {
            return value.toDate().getTime();
        }

        const date =
            new Date(value);

        return date.getTime() || 0;

    } catch {
        return 0;
    }
}


/* =========================================================
   RENDER
   ========================================================= */

function renderNotifications() {

    notificationsList.innerHTML = "";

    if (!notifications.length) {

        emptyNotifications.hidden = false;

        notificationCount.textContent =
            "No notifications";

        markAllButton.disabled = true;

        return;
    }

    emptyNotifications.hidden = true;

    const unreadCount =
        notifications.filter(
            notification =>
                notification.read !== true
        ).length;

    if (unreadCount === 0) {
        notificationCount.textContent =
            `${notifications.length} notification${notifications.length === 1 ? "" : "s"}`;
    } else {
        notificationCount.textContent =
            `${unreadCount} unread`;
    }

    markAllButton.disabled =
        unreadCount === 0;


    notifications.forEach(
        notification => {

            const card =
                document.createElement("article");

            card.className =
                "notification-card";

            if (
                notification.read !== true
            ) {
                card.classList.add("unread");
            }

            const type =
                getNotificationType(
                    notification
                );

            const title =
                notification.title ||
                "Handy update";

            const message =
                notification.message ||
                "You have a new update.";

            const time =
                formatTimestamp(
                    notification.createdAt ||
                    notification.timestamp ||
                    notification.updatedAt
                );

            const icon =
                getNotificationIcon(type);

            card.innerHTML = `
                <div class="notification-icon">
                    ${icon}
                </div>

                <div class="notification-content">

                    <h2 class="notification-title">
                        ${escapeHtml(title)}
                    </h2>

                    <p class="notification-message">
                        ${escapeHtml(message)}
                    </p>

                    <div class="notification-time">
                        ${escapeHtml(time)}
                    </div>

                </div>

                <div class="notification-actions">

                    ${
                        notification.read !== true
                            ? `
                                <span
                                    class="notification-dot"
                                    aria-label="Unread"
                                ></span>

                                <button
                                    type="button"
                                    class="notification-action"
                                    data-action="read"
                                    data-id="${escapeHtml(notification.id)}"
                                >
                                    Read
                                </button>
                            `
                            : ""
                    }

                    <button
                        type="button"
                        class="notification-action delete"
                        data-action="delete"
                        data-id="${escapeHtml(notification.id)}"
                    >
                        Remove
                    </button>

                </div>
            `;

            notificationsList.appendChild(
                card
            );
        }
    );
}


/* =========================================================
   HTML ESCAPE
   ========================================================= */

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


/* =========================================================
   READ NOTIFICATION
   ========================================================= */

async function markAsRead(notificationId) {

    if (!notificationId) return;

    try {

        const notificationRef =
            doc(
                db,
                "notifications",
                notificationId
            );

        await updateDoc(
            notificationRef,
            {
                read: true
            }
        );

    } catch (error) {

        console.error(
            "HANDY NOTIFICATION READ ERROR:",
            error
        );

        if (
            error.code ===
            "permission-denied"
        ) {
            showMessage(
                "Firebase denied this notification update."
            );
        } else {
            showMessage(
                "Unable to mark notification as read."
            );
        }
    }
}


/* =========================================================
   DELETE NOTIFICATION
   ========================================================= */

async function removeNotification(
    notificationId
) {

    if (!notificationId) return;

    try {

        const notificationRef =
            doc(
                db,
                "notifications",
                notificationId
            );

        await deleteDoc(
            notificationRef
        );

    } catch (error) {

        console.error(
            "HANDY NOTIFICATION DELETE ERROR:",
            error
        );

        if (
            error.code ===
            "permission-denied"
        ) {
            showMessage(
                "Firebase denied deleting this notification."
            );
        } else {
            showMessage(
                "Unable to remove notification."
            );
        }
    }
}


/* =========================================================
   MARK ALL AS READ
   ========================================================= */

async function markAllAsRead() {

    const unread =
        notifications.filter(
            notification =>
                notification.read !== true
        );

    if (!unread.length) {
        return;
    }

    markAllButton.disabled = true;
    markAllButton.textContent =
        "Updating...";

    try {

        const batch =
            writeBatch(db);

        unread.forEach(
            notification => {

                const notificationRef =
                    doc(
                        db,
                        "notifications",
                        notification.id
                    );

                batch.update(
                    notificationRef,
                    {
                        read: true
                    }
                );
            }
        );

        await batch.commit();

        showMessage(
            "All notifications marked as read.",
            "success"
        );

    } catch (error) {

        console.error(
            "HANDY MARK ALL ERROR:",
            error
        );

        if (
            error.code ===
            "permission-denied"
        ) {
            showMessage(
                "Firebase denied updating the notifications."
            );
        } else {
            showMessage(
                "Unable to mark all notifications as read."
            );
        }

    } finally {

        markAllButton.textContent =
            "Mark all as read";

        renderNotifications();
    }
}


/* =========================================================
   REAL-TIME NOTIFICATIONS
   ========================================================= */

function listenToNotifications() {

    if (!currentUser) return;

    if (unsubscribeNotifications) {
        unsubscribeNotifications();
    }

    const notificationsRef =
        collection(
            db,
            "notifications"
        );

    const notificationsQuery =
        query(
            notificationsRef,
            where(
                "userId",
                "==",
                currentUser.uid
            ),
            orderBy(
                "createdAt",
                "desc"
            )
        );

    unsubscribeNotifications =
        onSnapshot(
            notificationsQuery,

            snapshot => {

                notifications =
                    snapshot.docs.map(
                        notificationDoc => ({
                            id:
                                notificationDoc.id,
                            ...notificationDoc.data()
                        })
                    );

                notifications.sort(
                    (a, b) =>
                        getTimestampValue(b) -
                        getTimestampValue(a)
                );

                renderNotifications();
            },

            error => {

                console.error(
                    "HANDY NOTIFICATIONS LISTENER ERROR:",
                    error
                );

                if (
                    error.code ===
                    "failed-precondition"
                ) {
                    showMessage(
                        "Firestore needs an index for notifications. Open the Firebase console link from the error and create the suggested index."
                    );
                } else if (
                    error.code ===
                    "permission-denied"
                ) {
                    showMessage(
                        "Firebase denied access to your notifications."
                    );
                } else {
                    showMessage(
                        "Unable to load notifications."
                    );
                }

                notifications = [];

                renderNotifications();
            }
        );
}


/* =========================================================
   NAVIGATION
   ========================================================= */

function goToDashboard() {
    window.location.href =
        "./handyman-dashboard.html";
}

backButton?.addEventListener(
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


/* =========================================================
   ACTION EVENTS
   ========================================================= */

notificationsList?.addEventListener(
    "click",
    event => {

        const button =
            event.target.closest(
                "button[data-action]"
            );

        if (!button) return;

        const action =
            button.dataset.action;

        const id =
            button.dataset.id;

        if (action === "read") {
            markAsRead(id);
        }

        if (action === "delete") {
            removeNotification(id);
        }
    }
);


markAllButton?.addEventListener(
    "click",
    markAllAsRead
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

        currentUser = user;

        try {

            const userRef =
                doc(
                    db,
                    "users",
                    user.uid
                );

            const userSnapshot =
                await getDoc(userRef);

            if (!userSnapshot.exists()) {

                showMessage(
                    "Your Handy profile could not be found."
                );

                return;
            }

            const userData =
                userSnapshot.data();

            if (
                userData.role !==
                "handyman"
            ) {

                showMessage(
                    "This page is only available to handymen."
                );

                setTimeout(() => {
                    window.location.href =
                        "../login.html";
                }, 1000);

                return;
            }

            listenToNotifications();

        } catch (error) {

            console.error(
                "HANDY NOTIFICATION AUTH ERROR:",
                error
            );

            showMessage(
                "Unable to load your Handy account."
            );
        }
    }
);


/* =========================================================
   CLEANUP
   ========================================================= */

window.addEventListener(
    "beforeunload",
    () => {

        if (unsubscribeNotifications) {
            unsubscribeNotifications();
        }
    }
);